'use strict';

const http = require('http');
const https = require('https');
const Q = require('q');
const _ = require('underscore');
const config = require('@graphistry/config')();
const zlib = require('zlib');
const urllib = require('url');
const Cache = require('@graphistry/common').cache;

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/data-loader.js');

const VGraphLoader = require('./libs/VGraphLoader.js');

const loaders = {
  default: VGraphLoader.load,
  vgraph: VGraphLoader.load,
  jsonMeta: loadJSONMeta
};

const downloaders = {
  'http:': downloader.bind(undefined, http),
  'https:': downloader.bind(undefined, https),
  's3:': s3Downloader,
  null: s3Downloader // For legacy compatibility
};

const tmpCache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE);

function downloader(transport, url) {
  logger.trace('Attempting to download dataset');
  const result = Q.defer();

  // Q.denodeify fails http.get because it does not follow
  // the usual nodejs conventions
  transport
    .request(_.extend(url, { method: 'HEAD' }), res => {
      const lastModifiedTime = new Date(res.headers['last-modified']);
      // Try to read from cache otherwise download the dataset
      tmpCache
        .get(url, lastModifiedTime)
        .then(cacheResponse => {
          result.resolve(cacheResponse);
        })
        .fail(() => {
          transport
            .get(url.href, getResponse => {
              getResponse.setEncoding('binary');
              // const lastModifiedTime = new Date(getResponse.headers['last-modified']);

              let data = '';
              getResponse.on('data', chunk => {
                data += chunk;
              });

              getResponse.on('end', () => {
                const buffer = new Buffer(data, 'binary');
                tmpCache.put(url, buffer);
                result.resolve(buffer);
              });
            })
            .on('error', err => {
              logger.error(err, 'Cannot download dataset at', url.href);
              result.reject(err);
            });
        });
    })
    .on('error', err => {
      logger.error(err, 'Cannot fetch headers from', url.href);
      result.reject(err);
    })
    .end();

  return result.promise;
}

/*
* Kick off the download process. This checks the
 * modified time and fetches from S3 accordingly.
**/
function s3Downloader(url) {
  const params = {
    Bucket: url.host || config.BUCKET, // Defaults to Graphistry's bucket
    Key: decodeURIComponent(url.pathname.replace(/^\//, '')) // Strip leading slash if there is one
  };
  const res = Q.defer();

  // Attempt to download headers
  config.S3.headObject(params, (headError, headResponse) => {
    if (headError) {
      logger.trace('Could not fetch S3 header', headError.message);
      logger.trace('Falling back on local cache');
      // Try to load from cache regardless of timestamp.
      res.resolve(tmpCache.get(url, new Date(0)));
    } else {
      const modifiedTime = new Date(headResponse.LastModified);
      logger.debug('Got S3 headers, dataset was last modified on', modifiedTime);
      tmpCache
        .get(url, modifiedTime)
        .then(getResponse => {
          res.resolve(getResponse);
        })
        .fail(() => {
          // Not in cache of stale
          config.S3.getObject(params, (getError, getResponse) => {
            if (getError) {
              logger.error(getError, 'S3 Download failed');
              res.reject();
            } else {
              logger.trace('Successful S3 download');
              tmpCache.put(url, getResponse.Body);
              res.resolve(getResponse.Body);
            }
          });
        });
    }
  });

  return res.promise;
}

// If body is gzipped, decompress transparently
function unzipBufferIfCompressed(buffer, twice) {
  if (buffer.readUInt16BE(0) === 0x1f8b) {
    // Do we care about big endian? ARM?
    logger.trace('Data body is gzipped, decompressing');
    if (twice) {
      console.warn('Data blob is zipped at least twice!');
    }

    return Q.denodeify(zlib.gunzip)(buffer).then(decompressedResponse => {
      return unzipBufferIfCompressed(decompressedResponse, true);
    });
  } else {
    return Q(buffer);
  }
}

// Run appropriate loader based on dataset type
function loadDatasetIntoSim(graph, dataset) {
  logger.debug({ dataset: dataset.metadata }, 'Loading dataset');

  const loader = loaders[dataset.metadata.type];
  return unzipBufferIfCompressed(dataset.body).then(body => {
    dataset.body = body;
    return loader(graph, dataset);
  });
}

// Parse the json dataset description, download then load data.
function loadJSONMeta(graph, rawDataset) {
  const dataset = JSON.parse(rawDataset.body.toString('utf8'));
  return downloadDatasources(dataset).then(datasetWithData => {
    if (datasetWithData.datasources.length !== 1) {
      throw new Error('For now only datasets with one single datasource are supported');
    }
    if (datasetWithData.datasources[0].type !== 'vgraph') {
      throw new Error('For now only datasources of type "vgraph" are supported');
    }

    const data = datasetWithData.datasources[0].data;
    return VGraphLoader.load(graph, { body: data, metadata: datasetWithData });
  });
}

// Download all datasources in dataset
function downloadDatasources(dataset) {
  const qBlobs = _.map(dataset.datasources, datasource => {
    const url = urllib.parse(datasource.url);
    if (_.contains(_.keys(downloaders), url.protocol)) {
      return downloaders[url.protocol](url).then(blob => unzipBufferIfCompressed(blob));
    } else {
      throw new Error('Fetching datasources: protocol not yet supported' + url.href);
    }
  });

  return Q.all(qBlobs).then(blobs => {
    _.each(blobs, (blob, i) => {
      dataset.datasources[i].data = blob;
    });

    return dataset;
  });
}

const datasetConfigParams = ['scene', 'controls', 'mapper', 'device', 'vendor', 'type'];

function paramValueOrDefault(param) {
  return param !== undefined && param !== 'undefined' ? param : 'default';
}

module.exports = {
  loadDatasetIntoSim: loadDatasetIntoSim,
  datasetURLFromQuery: function datasetURLFromQuery(query) {
    if (!query.dataset) {
      return undefined;
    }
    return urllib.parse(decodeURIComponent(query.dataset));
  },
  datasetConfigFromQuery: function datasetConfigFromQuery(query) {
    const datasetConfig = {};
    _.each(datasetConfigParams, paramName => {
      datasetConfig[paramName] = paramValueOrDefault(query[paramName]);
    });
    return datasetConfig;
  },
  downloadDataset: function(datasetConfig) {
    logger.info(
      'scene:%s  controls:%s  mapper:%s  device:%s',
      datasetConfig.scene,
      datasetConfig.controls,
      datasetConfig.mapper,
      datasetConfig.device
    );
    const url = urllib.parse(datasetConfig.url);

    return downloaders[url.protocol](url)
      .then(data => ({ body: data, metadata: datasetConfig }))
      .fail(log.makeQErrorHandler(logger, 'Failure while retrieving dataset'));
  }
};

// vim: set et ff=unix ts=8 sw=4 fdm=syntax:

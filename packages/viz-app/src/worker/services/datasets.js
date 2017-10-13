import url from 'url';
import zlib from 'zlib';
import { Observable } from 'rxjs';
import { cache as Cache, logger as commonLogger } from '@graphistry/common';

const log = commonLogger.createLogger('viz-worker:services:datasets');

const downloaders = {
    's3:': downloadS3,
    null: downloadS3,
    'http:': downloadWWW.bind(undefined, require('http')),
    'https:': downloadWWW.bind(undefined, require('https'))
};

export function loadDataset(dataset, config, s3Cache) {
    log.debug(dataset, 'Attempting to load dataset');

    const datasetURL = url.parse(dataset.url);
    const download = downloaders[datasetURL.protocol];
    return download(datasetURL, s3Cache, config)
        .catch(e => {
            log.error(e, 'Error fetching dataset');
            return Observable.throw(e);
        })
        .map(buffer => ({ buffer, count: 0 }))
        .expand(unzipIfCompressed)
        .takeLast(1)
        .map(({ buffer }) => buffer);
}

function downloadWWW(transport, url, s3Cache, config) {
    const loadHeaders = Observable.bindCallback(transport.request.bind(transport));
    const loadDocument = Observable.bindCallback(transport.get.bind(transport), responseStream => {
        responseStream.setEncoding('binary');
        const onEnd = Observable.fromEvent(responseStream, 'end');
        const onData = Observable.fromEvent(responseStream, 'data');
        return onData
            .takeUntil(onEnd)
            .reduce((data, chunk) => data + chunk)
            .map(data => new Buffer(data, 'binary'));
    });

    return loadHeaders({
        ...url,
        ...{ method: 'HEAD' }
    }).mergeMap(({ headers }) =>
        Observable.from(
            s3Cache.get(url, new Date(headers['last-modified']), config.READ_PROCESS_DISCARD)
        ).catch(() =>
            loadDocument(url.href)
                .mergeAll()
                .mergeMap(
                    buffer =>
                        config.READ_PROCESS_DISCARD
                            ? Observable.of(null)
                            : s3Cache.put(url, buffer),
                    (buffer, x) => buffer
                )
        )
    );
}

function downloadS3(url, s3Cache, config) {
    const params = {
        Bucket: url.host || config.BUCKET, // Defaults to Graphistry's bucket
        Key: decodeURIComponent(url.pathname.replace(/^\//, '')) // Strip leading slash if there is one
    };

    const S3 = config.S3;
    const loadHeaders = Observable.bindNodeCallback(S3.headObject.bind(S3));
    const loadDocument = Observable.bindNodeCallback(S3.getObject.bind(S3));

    return loadHeaders(params)
        .mergeMap(({ LastModified }) =>
            Observable.from(
                s3Cache.get(url, new Date(LastModified), config.READ_PROCESS_DISCARD)
            ).catch(() =>
                loadDocument(params)
                    .catch(e => {
                        log.error(e, 'Cannot download dataset');
                        return Observable.throw(e);
                    })
                    .mergeMap(
                        ({ Body }) =>
                            config.READ_PROCESS_DISCARD
                                ? Observable.of(null)
                                : s3Cache.put(url, Body),
                        ({ Body }) => Body
                    )
            )
        )
        .catch(() => {
            log.debug('Cannot fetch headers from S3, falling back on cache');
            return Observable.from(
                s3Cache.get(url, new Date(0), config.READ_PROCESS_DISCARD)
            ).catch(e => {
                log.error('Could not load dataset from cache (S3 already failed too). Giving up!');
                return Observable.throw(e);
            });
        })
        .do(() => log.trace('Sucessfully loaded dataset.'));
}

// If body is gzipped, decompress transparently
function unzipIfCompressed({ buffer, count = 0 }) {
    if (buffer.readUInt16BE(0) === 0x1f8b) {
        // Do we care about big endian? ARM?
        // logger.trace('Data body is gzipped, decompressing');
        if (count > 0) {
            log.warn(`Data blob is zipped ${count} time${count === 1 ? '' : 's'}!`);
        }
        const unzip = Observable.bindNodeCallback(zlib.gunzip);
        return unzip(buffer).map(buffer => ({
            buffer,
            count: count + 1
        }));
    } else {
        return Observable.empty();
    }
}

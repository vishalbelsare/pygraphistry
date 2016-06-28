import url from 'url';
import zlib from 'zlib';
import _config from '@graphistry/config';
import { scenes } from '../../viz-shared/models';
import { graph as createGraph } from '../models';
import { Observable, ReplaySubject } from '@graphistry/rxjs';
import { load as loadVGraph } from '../simulator/libs/VGraphLoader';
import { cache as Cache, logger as commonLogger } from '@graphistry/common';
const logger = commonLogger.createLogger('viz-worker', 'viz-worker/services/loadGraph.js');

export function loadGraph(graphsById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    return function loadCurrentGraph({ workbook, server }) {
        const { datasets: { current: metadata }} = workbook;
        return (metadata.id in graphsById) ?
            graphsById[metadata.id] : (
            graphsById[metadata.id] = Observable
                .of({ ...metadata, scene: scenes[metadata.scene]() })
                .do(() => logger.info('scene:%s  controls:%s  mapper:%s  device:%s',
                                      metadata.scene, metadata.controls, metadata.mapper, metadata.device))
                .mergeMap(
                    (metadata) => downloadDataset(metadata, s3Cache, config),
                    (metadata, dataset) => ({ metadata, dataset })
                )
                .do(() => logger.trace('LOADING DATASET'))
                .mergeMap(({ metadata, dataset }) => unpackDataset(
                    dataset, metadata, s3Cache, config, createGraph(metadata)
                ))
                .do(loadDataFrameAndUpdateBuffers)
                // TODO: refactor everything in server-viz so we can delete these lines
                .mergeMap((graph) => {
                    if (server) {
                        const { interactions, interactionsLoop } = graph;
                        graph.server = server;
                        // graph.socket = server.socket;
                        server.animationStep = {
                            interact(x) {
                                interactions.next(x);
                            }
                        };
                        server.ticks.next(interactionsLoop);
                        return server.ticksMulti.take(1);
                    }
                    return Observable.of(graph);
                })
                .do((graph) => server && server.graph.next(graph))
                .concat(Observable.never())
                .multicast(new ReplaySubject(1))
                .refCount()
                .take(1)
            );
    }
}

const downloaders = {
    's3': downloadS3, 'null': downloadS3,
    'http': downloadWWW.bind(undefined, require('http')),
    'https': downloadWWW.bind(undefined, require('https'))
};

const unpackers = {
    'vgraph': loadVGraph,
    'default': loadVGraph,
    'jsonMeta': loadVGraphJSON
};

function downloadDataset(metadata, s3Cache, config) {
    const datasetURL = url.parse(metadata.url);
    const download = downloaders[datasetURL.protocol];
    return download(datasetURL, s3Cache, config);
}

function unpackDataset(dataset, metadata, s3Cache, config, graph) {
    const unpack = unpackers[metadata.type];
    return Observable
        .of({ dataset, count: 0 })
        .expand(unzipIfCompressed)
        .takeLast(1)
        .mergeMap(({ dataset }) => unpack(
            graph, { metadata, body: dataset }, s3Cache, config
        ));
}

function downloadWWW(transport, url, s3Cache, config) {

    const loadHeaders = Observable.bindCallback(transport.request.bind(transport));
    const loadDocument = Observable.bindCallback(
        transport.get.bind(transport),
        (responseStream) => {
            responseStream.setEncoding('binary');
            const onEnd  = Observable.fromEvent(responseStream, 'end');
            const onData = Observable.fromEvent(responseStream, 'data');
            return onData
                .takeUntil(onEnd)
                .reduce((data, chunk) => data + chunk)
                .map((data) => new Buffer(data, 'binary'))
        }
    );

    return loadHeaders({
            ...url, ...{ method: 'HEAD' }
        })
        .mergeMap(({ headers }) => Observable.from(s3Cache
            .get(url, new Date(headers['last-modified'])))
            .catch(() => loadDocument(url.href)
                .mergeAll()
                .mergeMap(
                    (buffer) => s3Cache.put(url, buffer),
                    (buffer, x) => buffer
                ))
        );
}

function downloadS3(url, s3Cache, { S3, BUCKET }) {

    const params = {
        Bucket: url.host || BUCKET,  // Defaults to Graphistry's bucket
        Key: decodeURIComponent(url.pathname.replace(/^\//,'')) // Strip leading slash if there is one
    };

    const loadHeaders = Observable.bindNodeCallback(S3.headObject.bind(S3));
    const loadDocument = Observable.bindNodeCallback(S3.getObject.bind(S3));

    return loadHeaders(params)
        .mergeMap(({ LastModified }) => Observable.from(s3Cache
            .get(url, new Date(LastModified)))
            .catch(() => loadDocument(params)
                .mergeMap(
                    ({ Body }) => s3Cache.put(url, Body)),
                    ({ Body }) => Body
                )
        )
        .catch(() => Observable.from(s3Cache.get(url, new Date(0))));
}

// If body is gzipped, decompress transparently
function unzipIfCompressed({ dataset, count = 0 }) {
    if (dataset.readUInt16BE(0) === 0x1f8b) { // Do we care about big endian? ARM?
        // logger.trace('Data body is gzipped, decompressing');
        if (count > 0) {
            console.warn(`Data blob is zipped ${count} time${count === 1 ? '' : 's'}!`);
        }
        const unzip = Observable.bindNodeCallback(zlib.gunzip);
        return unzip(dataset).map((dataset) => ({
            dataset, count: count + 1
        }));
    } else {
        return Observable.empty();
    }
}

function loadVGraphJSON(graph, { body }, s3Cache, config) {
    const dataset = JSON.parse(body.toString('utf8'));
    const metadata = dataset.datasources[0];
    return downloadDataset(metadata, s3Cache, config)
        .mergeMap((dataset) => unpackDataset(
            dataset, metadata, s3Cache, config, graph
        ));
}

function loadDataFrameAndUpdateBuffers({ simulator }) {

    const { dataframe } = simulator;
    // Load into dataframe data attributes that rely on the simulator existing.
    const inDegrees = dataframe.getHostBuffer('backwardsEdges').degreesTyped;
    const outDegrees = dataframe.getHostBuffer('forwardsEdges').degreesTyped;
    const unsortedEdges = dataframe.getHostBuffer('unsortedEdges');

    dataframe.loadDegrees(outDegrees, inDegrees);
    dataframe.loadEdgeDestinations(unsortedEdges);

    // Tell all layout algorithms to load buffers from dataframe, now that
    // we're about to enable ticking
    simulator.layoutAlgorithms.forEach((layoutAlgorithm) => {
        layoutAlgorithm.updateDataframeBuffers(simulator);
    });
}

import url from 'url';
import zlib from 'zlib';
import { Observable } from 'rxjs';
import { cache as Cache } from '@graphistry/common';

const downloaders = {
    's3:': downloadS3,
    'null': downloadS3,
    'http:': downloadWWW.bind(undefined, require('http')),
    'https:': downloadWWW.bind(undefined, require('https'))
};

export function loadDataset(dataset, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    const datasetURL = url.parse(dataset.url);
    const download = downloaders[datasetURL.protocol];
    return download(datasetURL, s3Cache, config)
        .map((buffer) => ({ buffer, count: 0 }))
        .expand(unzipIfCompressed)
        .takeLast(1)
        .map(({ buffer }) => buffer)
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
                    ({ Body }) => s3Cache.put(url, Body),
                    ({ Body }) => Body
                )
            )
        )
        .catch(() => Observable.from(s3Cache.get(url, new Date(0))));
}

// If body is gzipped, decompress transparently
function unzipIfCompressed({ buffer, count = 0 }) {
    if (buffer.readUInt16BE(0) === 0x1f8b) { // Do we care about big endian? ARM?
        // logger.trace('Data body is gzipped, decompressing');
        if (count > 0) {
            console.warn(`Data blob is zipped ${count} time${count === 1 ? '' : 's'}!`);
        }
        const unzip = Observable.bindNodeCallback(zlib.gunzip);
        return unzip(buffer).map((buffer) => ({
            buffer, count: count + 1
        }));
    } else {
        return Observable.empty();
    }
}

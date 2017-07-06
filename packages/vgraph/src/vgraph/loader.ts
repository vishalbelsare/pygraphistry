import { S3 } from 'aws-sdk';
import * as http from 'http';
import * as https from 'https';
import { gunzip } from 'zlib';
import { Observable } from 'rxjs';
import { VectorGraph } from './vgraph';
import { parse as urlParse } from 'url';

const vDecoders = {
    'null': decodeVGraph,
    'vgraph': decodeVGraph,
    'default': decodeVGraph,
    'undefined': decodeVGraph,
    'jsonMeta': decodeJSONMeta
};

const dProtocols = {
    's3:': [getOptionsS3, loadLastModifiedS3, loadDatasetS3],
    'null': [getOptionsS3, loadLastModifiedS3, loadDatasetS3],
    'http:': [getOptionsWWW, loadLastModifiedWWW, loadDatasetWWW],
    'https:': [getOptionsWWW, loadLastModifiedWWW, loadDatasetWWW]
};

const errorLoadingLastModified = new Error();

export interface DownloadOptions {
    S3: S3,
    cache: any,
    bucket: string,
    dataset: string,
    discard: boolean,
}

export interface LoaderOptions extends DownloadOptions {
    type: string;
    name?: string;
}

export function loadVGraph(options: LoaderOptions) {
    return Observable
        .of({ ...options, loaded: false })
        .expand(({ type, loaded, ...opts }) =>
            loaded === true
                ? Observable.empty()
                : downloadDataset(opts).map(vDecoders[type])
        )
        .takeLast(1);
}

export default loadVGraph;

function decodeVGraph({ buffer, opts }) {
    return {
        nodes: {}, edges: {},
        ...opts, buffer, loaded: true,
        vgraph: VectorGraph.decode(buffer)
    };
}

function decodeJSONMeta({ buffer, opts }) {
    const meta = JSON.parse(buffer.toString('utf8'));
    return {
        ...opts, ...meta,
        dataset: meta.datasources[0].url,
        nodes: meta.nodes[0], edges: meta.edges[0],
        type: meta.type || 'vgraph', loaded: false,
    };
}

function downloadDataset(opts: DownloadOptions) {

    const url = urlParse(opts.dataset), { protocol } = url;
    const [getOptions, loadLastModified, loadDocument] = dProtocols[protocol];
    const { transport, documentURL, lastModifiedURL } = getOptions(url, opts);

    return loadLastModified(transport, lastModifiedURL)
        .catch(() => Observable.of(errorLoadingLastModified))
        .flatMap((lastModified) => Observable
            .from(opts.cache.get(
                url,
                lastModified === errorLoadingLastModified
                    ? new Date(0)
                    : new Date(lastModified),
                opts.discard
            ))
            .catch((errorLoadingFromCache) =>
                lastModified === errorLoadingLastModified
                ? Observable.throw(errorLoadingFromCache)
                : loadDocument(transport, documentURL).mergeMap(
                    (document) => opts.discard
                        ? Observable.of(null)
                        : opts.cache.put(url, document),
                    (document) => document
                )
            )
        )
        .expand(unzipIfCompressed)
        .takeLast(1)
        .map((buffer) => ({ buffer, opts }))
}

function getOptionsS3(url, { S3, bucket }) {
    const s3Params = {
        Bucket: url.host || bucket,  // Defaults to Graphistry's bucket
        Key: decodeURIComponent(url.pathname.replace(/^\//,'')) // Strip leading slash if there is one
    };
    return {
        transport: S3,
        documentURL: s3Params,
        lastModifiedURL: s3Params,
    };
}

function getOptionsWWW(url, opts) {
    return {
        documentURL: url.href,
        lastModifiedURL: { ...url, method: 'HEAD' },
        transport: url.protocol === 'https:' ? https : http
    };
}

function loadLastModifiedS3(transport, url) {
    return Observable
        .bindNodeCallback(transport.headObject)
        .bind(transport)(url).pluck('LastModified');
}

function loadLastModifiedWWW(transport, url) {
    return Observable
        .bindCallback(transport.request)
        .bind(transport)({ ...url, method: 'HEAD' })
        .map(({ headers }) => headers['last-modified']);

}

function loadDatasetS3(transport, url) {
    return Observable
        .bindNodeCallback(transport.getObject)
        .bind(transport)(url).pluck('Body');
}

function loadDatasetWWW(transport, url) {
    return Observable
        .bindCallback(transport.get)
        .bind(transport)(url)
        .do((res) => res.setEncoding('binary'))
        .flatMap((res) => Observable.fromEvent(res, 'data')
               .takeUntil(Observable.fromEvent(res, 'end')))
        .reduce((data, chunk) => data + chunk)
        .map((data) => new Buffer(data, 'binary'));
}

// If body is gzipped, decompress transparently
function unzipIfCompressed(buffer) {
    if (buffer.readUInt16BE(0) === 0x1f8b) {
        return Observable.bindNodeCallback(gunzip)(buffer);
    } else {
        return Observable.empty();
    }
}

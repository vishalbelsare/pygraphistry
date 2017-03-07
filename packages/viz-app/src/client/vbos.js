import url from 'url';
import 'rxjs/add/observable/dom/ajax';
import { Observable } from 'rxjs/Observable';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

export function handleVboUpdates(socket, uri, renderState, sceneModel, renderer) {

    if (uri.pathname.substr(-1) !== '/') {
        uri = { ...uri, pathname: `${uri.pathname}/` };
    }

    const vboUpdates = new BehaviorSubject('init');
    const vboVersions = new BehaviorSubject({ buffers: {}, textures: {} });
    const allBufferNames = renderState.config.server.buffers;
    const allTextureNames = renderState.config.server.textures;

    Observable.fromEvent(socket, 'vbo_update',
        ({ step, textures, versions, elements, bufferByteLengths }, handshake) => ({
            step, textures, versions, elements, bufferByteLengths, handshake, startTime: Date.now()
    }))
    .scan(scanVersionChanges, { allBufferNames, allTextureNames, versions: { buffers: {}, textures: {} }})
    .do(() => vboUpdates.next('start'))
    .do(({ versions }) => vboVersions.next(versions))
    .do(({ buffers, textures }) => socket.emit('planned_binary_requests', { buffers, textures }))
    .mergeMap(
        (xs) => Observable.zip(
            fetchTextures({ ...xs, uri, id: socket.io.engine.id })
                .do(loadTextureBindings).toArray(),
            fetchBuffers({ ...xs, uri, id: socket.io.engine.id })
                .do(loadBufferBindings).toArray()
                .mapTo(xs).do(setRendererNumElements),
        ).take(1).defaultIfEmpty(null),
        (xs) => xs
    )
    .do(({ startTime, handshake, elements }) => {
        handshake(Date.now() - startTime);
        vboUpdates.onNext('received');
    })
    .switchMap(setModelNumElements)
    .subscribe({
        error(err) {
            console.error('vboUpdate error', err, (err||{}).stack);
        }
    });

    socket.emit('begin_streaming');

    return { vboUpdates, vboVersions };

    function loadBufferBindings({ startTime, elements, buffers, bufferBindings }) {
        // //TODO may be able to move this early
        // socket.emit('received_buffers', Date.now() - startTime);
        // for (const itemName in elements) {
        //     renderer.setNumElements(renderState, itemName, elements[itemName]);
        // }
        if (buffers.length) {
            renderer.loadBuffers(renderState, bufferBindings);
        }
    }

    function loadTextureBindings({ textures, textureBindings }) {
        if (textures.length) {
            renderer.loadTextures(renderState, textureBindings);
        }
    }

    function setRendererNumElements({ startTime, elements }) {
        //TODO may be able to move this early
        socket.emit('received_buffers', Date.now() - startTime);
        for (const itemName in elements) {
            renderer.setNumElements(renderState, itemName, elements[itemName]);
        }
    }

    function setModelNumElements({ elements = {}, bufferByteLengths = {} }) {
        const numPoints = elements.pointculled || elements.uberpointculled || 0;
        const numEdges = (elements.edgeculled ||
                          elements.edgeculledindexed ||
                          elements.edgeculledindexedclient ||
                          bufferByteLengths.logicalEdges / 4 || 0) * 0.5;
        return sceneModel.withoutDataSource().set(
            { path: ['renderer', 'edges', 'elements'], value: numEdges },
            { path: ['renderer', 'points', 'elements'], value: numPoints }
        );
    }
}

// Filter for server resource names that have changed (or not previously present)
//[ String ] * ?{?<name>: int} * ?{?<name>: int} -> [ String ]
function getUpdatedNames(names, originalVersions, newVersions) {
    if (!originalVersions || !newVersions) {
        return names;
    }
    return names.filter((name) => (
        newVersions.hasOwnProperty(name) && (
        originalVersions[name] !== newVersions[name])));
}

function scanVersionChanges(memo, next) {
    const { allBufferNames, allTextureNames } = memo;
    const { versions = {}, textures: textureNFOs = {} } = next;
    const buffers = getUpdatedNames(allBufferNames, memo.buffers, versions.buffers);
    const textures = getUpdatedNames(allTextureNames, memo.textures, versions.textures);
    const textureByteLengths = textures.reduce((lengths, name) => ({
        ...lengths, [name]: (textureNFOs[name] || {}).bytes || 0
    }), {});
    return {
        ...memo, ...next,
        buffers, textures, textureNFOs,
        allBufferNames, allTextureNames, textureByteLengths,
        versions: { buffers: { ...memo.versions.buffers, ...versions.buffers },
                    textures: { ...memo.versions.textures, ...versions.textures } }
    }
}

function fetchBuffers(xs) {
    const { id, uri, buffers, bufferByteLengths } = xs;
    return fetchResources(buffers, uri, 'vbo', 'buffer', id, bufferByteLengths)
        .map((bufferBindings) => ({ ...xs, bufferBindings }));
}

function fetchTextures(xs) {
    const { id, uri, textures, textureNFOs, textureByteLengths } = xs;
    return fetchResources(textures, uri, 'texture', 'texture', id, textureByteLengths)
        .map((textureData) => {
            for (const name in textureData) {
                textureData[name] = { ...textureNFOs[name], buffer: textureData[name] };
            }
            return { ...xs, textureBindings: textureData };
        })
        // .map((textureData) => textures.reduce((textures, name) => ({
        //     ...textures, [name]: { ...textureNFOs[name], buffer: textureData[name] }
        // }), {}))
        // .map((textureBindings) => ({ ...xs, textureBindings }));
}

function fetchResources(resources, uri, endpoint, type, id, byteLengths) {
    return Observable.merge(...resources.map((name) =>
            fetchResource(uri, endpoint, type, id, byteLengths, name)))
        .map(([name, buffer]) => ({ [name]: buffer }))
}

// function fetchResources(resources, uri, endpoint, type, id, byteLengths) {
//     return Observable
//         .combineLatest(resources.map((name) =>
//             fetchResource(uri, endpoint, type, id, byteLengths, name)))
//         .take(1).defaultIfEmpty([])
//         .map((buffers) => buffers.reduce((xs, [name, buffer]) => {
//             xs[name] = buffer;
//             return xs;
//         }, {}));
//         // .reduce((xs, ys) => ({ ...xs, ...ys }), {});
// }

function fetchResource(uri, endpoint, type, id, byteLengths, name) {
    return Observable.ajax({
        method: 'GET',
        timeout: 10000,
        responseType: 'arraybuffer',
        url: url.format({
            ...uri,
            query: { id, [type]: name },
            pathname: `${uri.pathname}${endpoint}`
        }),
    })
    .map(({ response }) => [
        name, new Uint8Array(response, 0, byteLengths[name])
    ])
    .catch(() => Observable.of([name, new Uint8Array(0) ]))
}

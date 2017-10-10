import url from 'url';
import 'rxjs/add/observable/dom/ajax';
import { Observable } from 'rxjs/Observable';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { createLogger } from '@graphistry/common/logger';
import { $atom } from '@graphistry/falcor-json-graph';
import shallowEqual from 'recompose/shallowEqual';
const logger = createLogger(__filename);

export function handleVboUpdates(socket, uri, renderState, sceneModel, renderer) {
  if (uri.pathname.substr(-1) !== '/') {
    uri = { ...uri, pathname: `${uri.pathname}/` };
  }

  const vboUpdates = new BehaviorSubject('init');
  const vboVersions = new BehaviorSubject({ buffers: {}, textures: {} });
  const allBufferNames = renderState.config.server.buffers;
  const allTextureNames = renderState.config.server.textures;
  const setSessionStatus = sceneModel._root.topLevelModel
    .withoutDataSource()
    .set({
      json: {
        workbooks: {
          open: {
            views: {
              current: {
                session: {
                  message: null,
                  progress: 100,
                  status: 'default'
                  // status: $atom('default', { $timestamp: Date.now() })
                }
              }
            }
          }
        }
      }
    })
    .ignoreElements();

  Observable.fromEvent(
    socket,
    'vbo_update',
    ({ textures, versions, elements, bufferByteLengths }, handshake) => ({
      id: socket.io.engine.id,
      startTime: Date.now(),
      textures,
      versions,
      elements,
      bufferByteLengths,
      handshake
    })
  )
    .scan(scanVersionChanges, {
      allBufferNames,
      allTextureNames,
      versions: { buffers: {}, textures: {} }
    })
    .do(({ versions }) => vboUpdates.next('start') || vboVersions.next(versions))
    .do(({ buffers, textures }) => socket.emit('planned_binary_requests', { buffers, textures }))
    .mergeMap(
      // <-- todo: do we want to switchMap here?
      xs =>
        setSessionStatus.merge(
          Observable.zip(
            fetchBuffers(xs.id, uri, xs.buffers, xs.bufferByteLengths),
            fetchTextures(xs.id, uri, xs.textures, xs.textureByteLengths, xs.textureNFOs),
            loadBindings
          )
            .take(1)
            .defaultIfEmpty(null)
        ),
      identity
    )
    .map(getNumElementsAndSocketHandshake)
    .distinctUntilChanged(shallowEqual)
    .switchMap(setRendererNumElements)
    .catch(err => {
      logger.error('vboUpdate error', err, (err || {}).stack);
      return Observable.empty();
    })
    .repeat()
    .subscribe({});

  socket.emit('begin_streaming');

  return { vboUpdates, vboVersions };

  function identity(xs) {
    return xs;
  }
  function loadBindings([buffers, bufferBindings], [textures, textureBindings]) {
    if (buffers && buffers.length) {
      renderer.loadBuffers(renderState, bufferBindings);
    }
    if (textures && textures.length) {
      renderer.loadTextures(renderState, textureBindings);
    }
  }

  function getNumElementsAndSocketHandshake({ startTime, handshake, elements, bufferByteLengths }) {
    const elapsedTime = Date.now() - startTime;
    //TODO may be able to move this early
    socket.emit('received_buffers', elapsedTime);
    for (const itemName in elements) {
      renderer.setNumElements(renderState, itemName, elements[itemName]);
    }
    handshake(elapsedTime);
    vboUpdates.onNext('received');
    return [
      /* numPoints */ elements.pointculled || elements.uberpointculled || 0,
      /* numEdges  */ (elements.edgeculled ||
        elements.edgeculledindexed ||
        elements.edgeculledindexedclient ||
        bufferByteLengths.logicalEdges / 4 ||
        0) * 0.5
    ];
  }

  function setRendererNumElements([numPoints, numEdges]) {
    return sceneModel
      .withoutDataSource()
      .set(
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
  return names.filter(
    name => newVersions.hasOwnProperty(name) && originalVersions[name] !== newVersions[name]
  );
}

function scanVersionChanges(memo, next) {
  const { allBufferNames, allTextureNames } = memo;
  const { versions = {}, textures: textureNFOs = {} } = next;
  const buffers = getUpdatedNames(allBufferNames, memo.buffers, versions.buffers);
  const textures = getUpdatedNames(allTextureNames, memo.textures, versions.textures);
  const textureByteLengths = textures.reduce(
    (lengths, name) => ({
      ...lengths,
      [name]: (textureNFOs[name] || {}).bytes || 0
    }),
    {}
  );
  return {
    ...memo,
    ...next,
    buffers,
    textures,
    textureNFOs,
    allBufferNames,
    allTextureNames,
    textureByteLengths,
    versions: {
      buffers: { ...memo.versions.buffers, ...versions.buffers },
      textures: { ...memo.versions.textures, ...versions.textures }
    }
  };
}

function fetchBuffers(id, uri, buffers, bufferByteLengths) {
  return fetchResources(buffers, uri, 'vbo', 'buffer', id, bufferByteLengths).map(data => [
    buffers,
    data
  ]);
}

function fetchTextures(id, uri, textures, textureByteLengths, textureNFOs) {
  return fetchResources(textures, uri, 'texture', 'texture', id, textureByteLengths).map(data => {
    for (const name in data) {
      data[name] = { ...textureNFOs[name], buffer: data[name] };
    }
    return [textures, data];
  });
}

function fetchResources(resources, uri, endpoint, type, id, byteLengths) {
  return Observable.merge(
    ...resources.map(name => fetchResource(uri, endpoint, type, id, byteLengths, name))
  ).reduce((xs, [name, buffer]) => ((xs[name] = buffer) && xs) || xs, Object.create(null));
}

function fetchResource(uri, endpoint, type, id, byteLengths, name) {
  return Observable.ajax({
    method: 'GET',
    timeout: 10000,
    responseType: 'arraybuffer',
    url: url.format({
      ...uri,
      query: { id, [type]: name },
      pathname: `${uri.pathname}${endpoint}`
    })
  })
    .map(({ response }) => [name, new Uint8Array(response, 0, byteLengths[name])])
    .catch(() => Observable.of([name, new Uint8Array(0)]));
}

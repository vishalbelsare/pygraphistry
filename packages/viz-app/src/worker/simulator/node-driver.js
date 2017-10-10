//prebaked script to load uber data
//similar to main.js

const Q = require('q');
const Rx = require('rxjs');
const _ = require('underscore');
const rConf = require('viz-app/models/scene');

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/node-driver');
const perf = require('@graphistry/common').perfStats.createPerfMonitor();

/** @typedef {Object} GraphCount
 * @property {Number} num # of vertices
 * @property {Number} offset in vertices
 */

/**
 * number/offset of graph elements and how they relate to various models (result keyed by model name)
 * @param {GraphManager} graph
 * @param {Boolean?} debug
 * @returns {Object.<String, GraphCount>}
 */
function graphCounts(graph, debug = false) {
  const numRenderedSplits = graph.simulator.dataframe.getNumElements('renderedSplits');

  const numPoints = graph.dataframe.getNumElements('point');
  const numEdges = graph.dataframe.getNumElements('edge') * 2;
  const offsetPoint = 0;
  const offsetEdge = 0;
  const numMidPoints = graph.dataframe.getNumElements('midPoints');
  const numMidEdges = graph.dataframe.getNumElements('midEdges');
  const offsetMidPoints = 0;
  const offsetMidEdges = 0;
  const numForwardsEdgeStartEndIdxs = graph.dataframe.getNumElements('point') * 2;
  const numBackwardsEdgeStartEndIdxs = graph.dataframe.getNumElements('point') * 2;
  const offsetEdgeStartEndIdxs = 0;
  const numSelectedEdgeIndexes = graph.dataframe.lastSelectionMasks.numEdges();
  const numSelectedPointIndexes = graph.dataframe.lastSelectionMasks.numPoints();
  const offsetSelectedEdgeIndexes = 0;
  const offsetSelectedPointIndexes = 0;

  const point = { num: numPoints, offset: offsetPoint };
  const edge = { num: numEdges, offset: offsetEdge };
  const midPoint = { num: numMidPoints, offset: offsetMidPoints };
  const midEdge = { num: numMidEdges, offset: offsetMidEdges };
  const midEdgeColor = { num: numEdges * (numRenderedSplits + 1), offset: offsetMidEdges };
  const selectedEdgeIndexes = { num: numSelectedEdgeIndexes, offset: offsetSelectedEdgeIndexes };
  const selectedPointIndexes = { num: numSelectedPointIndexes, offset: offsetSelectedPointIndexes };
  const forwardsEdgeStartEndIdxs = {
    num: numForwardsEdgeStartEndIdxs,
    offset: offsetEdgeStartEndIdxs
  };
  const backwardsEdgeStartEndIdxs = {
    num: numBackwardsEdgeStartEndIdxs,
    offset: offsetEdgeStartEndIdxs
  };
  const onePerEdge = { num: numEdges / 2, offset: 0 };

  const counts = {
    curPoints: point,
    springsPos: edge,
    logicalEdges: edge,
    pointSizes: point,
    pointColors: point,
    edgeColors: edge,
    edgeHeights: onePerEdge,
    edgeSeqLens: onePerEdge,
    forwardsEdgeToUnsortedEdge: onePerEdge,
    curMidPoints: midPoint,
    midSpringsPos: midEdge,
    midSpringsColorCoord: midEdge,
    midEdgeColors: midEdgeColor,
    selectedEdgeIndexes: selectedEdgeIndexes,
    selectedPointIndexes: selectedPointIndexes,
    forwardsEdgeStartEndIdxs: forwardsEdgeStartEndIdxs,
    backwardsEdgeStartEndIdxs: backwardsEdgeStartEndIdxs
  };

  if (debug) {
    console.log('counts: ', counts);
    _.each(_.keys(graph.dataframe.rawdata), key1 => {
      console.log(key1 + ': ' + _.keys(graph.dataframe.rawdata[key1]));
    });
    console.log('Simulator Buffer Keys: ', _.keys(graph.dataframe.rawdata.buffers.simulator));
    console.log('Host Buffer Point: ', graph.dataframe.rawdata.hostBuffers.points);

    console.log('dataframe: ', graph.dataframe.rawdata);
  }

  return counts;
}

function getBufferVersion(graph, bufferName) {
  // First check newer, data frame based version
  const dataframeVersion = graph.dataframe.getVersion('localBuffer', bufferName);
  if (dataframeVersion !== undefined) {
    return dataframeVersion;
  }

  // If that failed, attempt to get in the deprecated simulator method
  const deprecatedSimulatorBuffers = graph.simulator.versions.buffers;
  if (bufferName in deprecatedSimulatorBuffers) {
    return deprecatedSimulatorBuffers[bufferName];
  }

  // Could not find a version number anywhere.
  // Fatal exception, kill process.
  logger.die('Cannot find version of buffer %s', bufferName);
}

// ... -> {<name>: {buffer: ArrayBuffer, version: int}}
function fetchVBOs(graph, renderConfig, bufferNames, counts) {
  const bufferSizes = fetchBufferByteLengths(counts, renderConfig);
  const targetArrays = {};

  const layouts = _.object(
    _.map(bufferNames, name => {
      const model = renderConfig.models[name];
      if (_.values(model).length !== 1) {
        logger.die('Currently assumes one view per model');
      }

      return [name, _.values(model)[0]];
    })
  );
  const hostBufs = _.omit(layouts, layout => layout.datasource !== rConf.VBODataSources.HOST);
  const devBufs = _.omit(layouts, layout => layout.datasource !== rConf.VBODataSources.DEVICE);

  // TODO: Instead of doing blocking CL reads, use CL events and wait on those.
  // node-webcl's event arguments to enqueue commands seems busted at the moment, but
  // maybe enqueueing a event barrier and using its event might work?
  return Q.all(
    _.map(devBufs, (layout, name) => {
      const stride = layout.stride || layout.count * gl2Bytes(layout.type);

      targetArrays[name] = {
        buffer: new ArrayBuffer(bufferSizes[name]),
        version: graph.simulator.versions.buffers[name]
      };

      logger.trace('Reading device buffer %s, stride %d', name, stride);

      return graph.simulator.dataframe
        .getBuffer(name, 'simulator')
        .read(
          new Float32Array(targetArrays[name].buffer),
          counts[name].offset * stride,
          counts[name].num * stride
        );
    })
  )
    .then(() => {
      _.each(hostBufs, (layout, name) => {
        // const stride = layout.stride || (layout.count * gl2Bytes(layout.type));

        logger.trace('Fetching host buffer %s', name);
        const localBuffer = graph.simulator.dataframe.getLocalBuffer(name);
        const bytesPerElement = localBuffer.BYTES_PER_ELEMENT;

        // This will create another array (of type buffersLocal[name]) on top
        // of the existing array

        logger.debug(
          { counts: counts[name] },
          'Copying hostBuffer[' + name + ']. Orig Buffer len: ',
          localBuffer.length
        );
        logger.debug('constructor: ', localBuffer.constructor);

        targetArrays[name] = {
          buffer: new localBuffer.constructor(
            localBuffer.buffer,
            counts[name].offset * bytesPerElement,
            counts[name].num
          ),
          version: getBufferVersion(graph, name)
        };
      });
      return targetArrays;
    })
    .fail(log.makeQErrorHandler(logger, 'node-driver.fetchVBO'));
}

/** For each render item, find a serverside model and send its count
 * @param {Object.<String, GraphCount>} counts
 * @param {RenderConfig} renderConfig
 * @returns {Object.<String, Number?>}
 */
function fetchNumElements(counts, renderConfig) {
  return _.object(
    _.keys(renderConfig.items).map(item => {
      const itemDef = renderConfig.items[item];
      let aServersideModelName;
      if (itemDef.index) {
        aServersideModelName = itemDef.index[0];
      } else {
        const serversideModelBindings = _.values(
          renderConfig.items[item].bindings
        ).filter(binding => {
          const model = renderConfig.models[binding[0]];
          return rConf.isBufServerSide(model);
        });
        if (serversideModelBindings.length !== 0) {
          aServersideModelName = serversideModelBindings[0][0];
          return [item, aServersideModelName ? counts[aServersideModelName].num : 0];
        }
        return [];
      }
      return [item, aServersideModelName ? counts[aServersideModelName].num : 0];
    })
  );
}

/** Find num bytes needed for each model
 * @param {Object.<String, GraphCount>} counts
 * @param {RenderConfig} renderConfig
 * @returns {Object.<String, Number>}
 */
function fetchBufferByteLengths(counts, renderConfig) {
  return _.chain(renderConfig.models)
    .omit(model => rConf.isBufClientSide(model))
    .map((model, name) => {
      const layout = _.values(model)[0];
      const count = counts[name].num;
      return [name, count * (layout.stride || gl2Bytes(layout.type) * layout.count)];
    })
    .object()
    .value();
}

function gl2Bytes(type) {
  const types = {
    FLOAT: 4,
    UNSIGNED_BYTE: 1,
    UNSIGNED_SHORT: 2,
    UNSIGNED_INT: 4
  };
  if (!(type in types)) {
    logger.die('Unknown GL type "%s"', type);
  }
  return types[type];
}

/**
 * Returns an Observable that fires an event in `delay` ms, with the given `value`
 * @param  {number}   [delay=16]    - the time, in milliseconds, before the event is fired
 * @param  {*}        [value=false] - the value of the event (`delay` must be given if `value` is)
 * @return {Rx.Observable} A Rx Observable stream that emits `value` after `delay`, and finishes
 */
function delayObservableGenerator(delay, value, cb) {
  if (arguments.length < 2) {
    cb = arguments[0];
    delay = 16;
    value = false;
  } else if (arguments.length < 3) {
    cb = arguments[1];
    value = false;
  }

  return Rx.Observable
    .return(value)
    .delay(delay)
    .flatMap(v1 => {
      return Rx.Observable.bindNodeCallback((v2, cb) => {
        setImmediate(() => {
          cb(v2);
        });
      })(v1);
    });
}

///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////

export function createInteractionsLoop({
  dataset,
  /* socket, */ nBody,
  //Observable {play: bool, layout: bool, ... cfg settings ...}
  //  play: animation stream
  //  layout: whether to actually call layout algorithms (e.g., don't for filtering)
  interactions
}) {
  const { globalControls: { simulationTime = 1 } } = nBody;
  const { Observable, Scheduler, Subject, BehaviorSubject } = Rx;

  const renderTriggers = interactions
    .filter(Boolean)
    .do(x => x.simControls && nBody.updateSettings(x))
    .multicast(
      () => new Subject(),
      renderTriggers =>
        renderTriggers.merge(
          Observable.merge(
            renderTriggers
              .filter(({ layout }) => layout)
              .startWith(0)
              .auditTime(simulationTime, Scheduler.async),
            renderTriggers
              .filter(({ layout }) => !layout)
              .startWith(0)
              .auditTime(4, Scheduler.async) // <-- todo: magic numbers?
          ).map(() => ({ play: false, layout: false }))
        )
    );

  return renderTriggers
    .multicast(
      () => {
        logger.trace('STARTING DRIVER');
        logger.trace('LOADING DATASET');
        return new BehaviorSubject({ play: false, layout: false });
      },
      renderTriggers =>
        renderTriggers
          .do(x => {
            logger.trace('=============================isRunningRecent:', x);
          })
          .filter(({ play }) => play)
          // Force a break in the event loop, so things
          // like socket event handlers don't queue up
          .auditTime(0, Scheduler.async)
          .exhaustMap(
            x => {
              perf.startTiming('tick_durationMS');
              return nBody.tick(x);
            },
            x => {
              perf.endTiming('tick_durationMS');
              return nBody;
            }
          )
          .take(1)
          .subscribeOn(Scheduler.async)
          .repeat()
    )
    .startWith(nBody);
}

/**
 *
 * @param dataset
 * @param socket
 * @param {NBody} nBodyInstance
 * @returns {{interact: interact, ticks: Observable<T>, graph: void}}
 */
export function create(dataset, socket, nBodyInstance) {
  logger.trace('STARTING DRIVER');

  // Observable {play: bool, layout: bool, ... cfg settings ...}
  //  play: animation stream
  //  layout: whether to actually call layout algs (e.g., don't for filtering)
  const userInteractions = new Rx.Subject();

  // This signal is emitted whenever the renderer's VBOs change, and contains Typed Arraysn for
  // the contents of each VBO
  const animStepSubj = new Rx.BehaviorSubject(null);

  const graph = nBodyInstance
    .then(graph => {
      logger.trace('LOADING DATASET');
      return Q.all([
        loader.loadDatasetIntoSim(graph, dataset)
        // clientNotification.loadingStatus(socket, 'Loading dataset')
      ]);
    })
    .spread(graph => {
      // Load into dataframe data attributes that rely on the simulator existing.
      const outDegrees = graph.simulator.dataframe.getHostBuffer('forwardsEdges').degreesTyped;
      const inDegrees = graph.simulator.dataframe.getHostBuffer('backwardsEdges').degreesTyped;
      const unsortedEdges = graph.simulator.dataframe.getHostBuffer('unsortedEdges');

      graph.dataframe.loadDegrees(outDegrees, inDegrees);
      graph.dataframe.loadEdgeDestinations(unsortedEdges);
      return graph;
    })
    .then(graph => {
      // Tell all layout algorithms to load buffers from dataframe, now that
      // we're about to enable ticking
      _.each(graph.simulator.layoutAlgorithms, layoutAlgorithm => {
        layoutAlgorithm.updateDataframeBuffers(graph.simulator);
      });

      return graph;
    })
    .then(graph => {
      logger.trace('ANIMATING');

      const play = userInteractions.filter(o => o && o.play);

      //Observable {play: bool, layout: bool}
      const isRunning = Rx.Observable.merge(
        //run beginning & after every interaction
        play.merge(Rx.Observable.return({ play: true, layout: false })),
        //...  but stop a bit after last one
        play
          .filter(o => o && o.layout)
          .merge(Rx.Observable.return())
          .delay(graph.globalControls.simulationTime)
          .map(_.constant({ play: false, layout: false })),
        play
          .filter(o => !o || !o.layout)
          .merge(Rx.Observable.return())
          .delay(4)
          .map(_.constant({ play: false, layout: false }))
      );

      const isRunningRecent = new Rx.ReplaySubject(1);

      isRunningRecent.subscribe(v => {
        logger.trace('=============================isRunningRecent:', v);
      });

      isRunning.subscribe(isRunningRecent);

      // Loop simulation by recursively expanding each tick event into a new sequence
      // Gate by isRunning
      Rx.Observable
        .return(graph)
        // .flatMap(() => Rx.Observable.fromPromise(graph.tick(0, {play: true, layout: false})))
        .expand(graph => {
          perf.startTiming('tick_durationMS');
          // return (Rx.Observable.fromCallback(graph.renderer.document.requestAnimationFrame))()
          return (
            Rx.Observable
              .return()
              // Add in a delay to allow Node's event loop some breathing room
              .flatMap(() => delayObservableGenerator(1, false))
              .flatMap(() => isRunningRecent.filter(o => o.play).take(1))
              .flatMap(v =>
                Rx.Observable.fromPromise(
                  graph
                    .updateSettings(v)
                    .then(() => graph.tick(v))
                    .then(() => {
                      perf.endTiming('tick_durationMS');
                    })
                )
              )
              .map(_.constant(graph))
          );
        })
        .subscribe(animStepSubj, log.makeRxErrorHandler(logger, 'node-driver: tick failed'));

      logger.trace('Graph created');
      return graph;
    })
    // .then((graph) =>
    //     clientNotification.loadingStatus(socket, 'Graph created', null, graph) // returns graph
    // )
    .fail(err => {
      logger.die(err, 'Driver initialization error');
    })
    .done();

  return {
    interact: function(settings) {
      userInteractions.onNext(settings);
    },
    ticks: animStepSubj.skip(1),
    graph: graph
  };
}

function extendDataVersions(data, bufferVersions, graph) {
  const versions = data.versions;

  _.each(_.keys(bufferVersions), key => {
    if (versions[key] === undefined) {
      versions[key] = bufferVersions[key];
    }
  });
  _.each(_.keys(graph.simulator.versions.buffers), key => {
    if (versions[key] === undefined) {
      versions[key] = graph.simulator.versions.buffers[key];
    }
  });

  return data;
}

/**
 * Fetches compressed VBO data and # of elements for active buffers and programs
 * @returns {Rx.Observable} an observable sequence containing one item, an Object with the 'buffers'
 * property set to an Object mapping buffer names to ArrayBuffer data; and the 'elements' Object
 * mapping render item names to number of elements that should be rendered for the given buffers.
 */
export function fetchData(
  graph,
  renderConfig,
  compress,
  bufferNames,
  bufferVersions,
  programNames
) {
  const counts = graphCounts(graph);

  bufferVersions = bufferVersions || _.object(bufferNames.map(name => [name, -1]));
  const bufferByteLengths = _.pick(fetchBufferByteLengths(counts, renderConfig), bufferNames);

  const elements = _.pick(fetchNumElements(counts, renderConfig), programNames);
  const neededBuffers = bufferNames.filter(name => {
    const clientVersion = bufferVersions[name];
    const liveVersion = getBufferVersion(graph, name);
    return clientVersion !== liveVersion;
  });
  bufferNames = neededBuffers;

  if (bufferNames.length === 0) {
    const obj = {
      compressed: [],
      uncompressed: [],
      elements: [],
      bufferByteLengths: [],
      versions: []
    };
    extendDataVersions(obj, bufferVersions, graph);
    logger.debug('fetchData has no requested buffers. Returning empty arrays.');
    return Rx.Observable.from([obj]);
  }

  perf.startTiming('fetchVBOs_durationMS');
  return Rx.Observable
    .fromPromise(fetchVBOs(graph, renderConfig, bufferNames, counts))
    .flatMap(vbos => {
      //perf.getMetric({metric: {'fetchVBOs_lastVersions': bufferVersions}});
      perf.endTiming('fetchVBOs_durationMS');

      bufferNames.forEach(bufferName => {
        if (!vbos.hasOwnProperty(bufferName)) {
          logger.die('Vbos does not have buffer %s', bufferName);
        }
      });

      _.each(bufferNames, bufferName => {
        const actualByteLength = vbos[bufferName].buffer.byteLength;
        const expectedByteLength = bufferByteLengths[bufferName];
        if (actualByteLength !== expectedByteLength) {
          logger.error(
            'Mismatch length for VBO %s (Expected:%d Got:%d)',
            bufferName,
            expectedByteLength,
            actualByteLength
          );
        }
      });

      //[ {buffer, version, compressed} ] ordered by bufferName
      perf.startTiming('compressAll_durationMS');
      const compressed = bufferNames.map(bufferName => {
        perf.startTiming('compress_durationMS');
        return Rx.Observable.bindNodeCallback(compress.deflate)(
          vbos[bufferName].buffer, //binary,
          {
            output: new Buffer(Math.max(1024, Math.round(vbos[bufferName].buffer.byteLength * 1.5)))
          }
        ).map(compressed => {
          const byteLength = vbos[bufferName].buffer.byteLength;
          logger.trace('compress bufferName %s (size %d)', bufferName, byteLength);
          perf.histogram('compress_inputBytes', byteLength);
          perf.histogram('compress_outputBytes', compressed.length);
          perf.endTiming('compress_durationMS');
          return _.extend({}, vbos[bufferName], { compressed: compressed });
        });
      });

      return Rx.Observable
        .combineLatest(compressed)
        .take(1)
        .do(() => {
          perf.endTiming('compressAll_durationMS');
        })
        .map(compressedVBOs => {
          const buffers = _.object(
            _.zip(bufferNames, bufferNames.map((_, i) => compressedVBOs[i].compressed[0]))
          );

          const uncompressed = _.object(
            _.zip(
              bufferNames,
              bufferNames.map((_, i) => compressedVBOs[i].buffer.buffer || compressedVBOs[i].buffer)
            )
          );

          const versions = _.object(
            _.zip(bufferNames, bufferNames.map((_, i) => compressedVBOs[i].version))
          );

          const bundledData = {
            compressed: buffers,
            uncompressed: uncompressed,
            elements: elements,
            bufferByteLengths: bufferByteLengths,
            versions: versions,
            tick: graph.simulator.versions.tick
          };

          extendDataVersions(bundledData, bufferVersions, graph);
          return bundledData;
        });
    });
}

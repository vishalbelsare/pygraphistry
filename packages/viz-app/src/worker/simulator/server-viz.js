// Set jshint to ignore `predef:'io'` in .jshintrc so we can manually define io here
/* global -io */

import Rx from 'rxjs';
// import testColormap2 from '../textures/test-colormap2.rgba';

const Observable  = Rx.Observable;

Rx.Observable.return = function (value) {
    return Rx.Observable.of(value);
};

Rx.Subject.prototype.onNext = Rx.Subject.prototype.next;
Rx.Subject.prototype.onError = Rx.Subject.prototype.error;
Rx.Subject.prototype.onCompleted = Rx.Subject.prototype.complete;
Rx.Subject.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;
Rx.AsyncSubject.prototype.onNext = Rx.AsyncSubject.prototype.next;
Rx.AsyncSubject.prototype.onCompleted = Rx.AsyncSubject.prototype.complete;
Rx.BehaviorSubject.prototype.onNext = Rx.BehaviorSubject.prototype.next;
Rx.ReplaySubject.prototype.onNext = Rx.ReplaySubject.prototype.next;

Rx.Subscriber.prototype.onNext = Rx.Subscriber.prototype.next;
Rx.Subscriber.prototype.onError = Rx.Subscriber.prototype.error;
Rx.Subscriber.prototype.onCompleted = Rx.Subscriber.prototype.complete;
Rx.Subscriber.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;

Rx.Subscription.prototype.dispose = Rx.Subscription.prototype.unsubscribe;

const _           = require('underscore');
const Q           = require('q');
const fs          = require('fs');
const path        = require('path');
const extend      = require('node.extend');
// const rConf       = require('viz-app/models/scene');
const lConf       = require('./layout.config.js');
const cljs        = require('./cl.js');
const driver      = require('./node-driver.js');

import * as compress from '@graphistry/node-pigz';
import { isBufServerSide, isTextureServerSide } from 'viz-app/models/scene';
import { applyEncodingOnNBody, resetEncodingOnNBody } from './EncodingManager.js';

const config      = require('@graphistry/config')();
const log         = require('@graphistry/common').logger;
const logger      = log.createLogger('graph-viz', 'graph-viz/viz-server.js');
const perf        = require('@graphistry/common').perfStats.createPerfMonitor();

try {
    const memoryWatcher = require('memwatch-next');
    if (memoryWatcher !== undefined) {
        memoryWatcher.on('leak', (info) => {
            logger.warn({'memory_leak': info});
        });
        memoryWatcher.on('stats', (stats) => {
            logger.trace({'memory_stats': stats});
        });
    }
} catch (e) {
    logger.debug({message: 'memwatch unavailable', err: e});
}

/** GLOBALS ****************************************************/


const saveAtEachStep = false;
const defaultSnapshotName = 'snapshot';

/** END GLOBALS ****************************************************/

function VizServer (app, socket, cachedVBOs, loggerMetadata, colorTexture) {
    log.addMetadataField(loggerMetadata);

    const socketLogger = logger.child({
        socketID: socket.client.id
    });

    socketLogger.info('Client connected');
    this.socketLogger = socketLogger;

    this.app = app;
    this.isActive = true;
    this.socket = socket;
    this.cachedVBOs = cachedVBOs;
    this.colorTexture = colorTexture;
    /** @type {GraphistryURLParams} */
    const query = this.socket.handshake.query;

    /** @type {ReplaySubject<GraphManager>} */
    this.graph = new Rx.ReplaySubject(1);
    this.workbookDoc = new Rx.ReplaySubject(1);
    this.dataset = new Rx.ReplaySubject(1);
    this.renderConfig = new Rx.ReplaySubject(1);
    this.ticksMulti = new Rx.Subject();
    this.updateVboSubject = new Rx.ReplaySubject(1);

    this.socket.once('begin_streaming', (ignore, cb) => {
        this.renderConfig.take(1).subscribe(
            (renderConfig) => {
                this.beginStreaming(renderConfig, colorTexture, app);
                if (cb) {
                    return cb({success: true});
                }
            },
            log.makeQErrorHandler(logger, 'begin_streaming')
        );
    });
}

/** Given an Object with buffers as values, returns the sum size in megabytes of all buffers */
function sizeInMBOfVBOs (VBOs) {
    const vboSizeBytes =
        _.reduce(
            _.pluck(_.values(VBOs.buffers), 'byteLength'),
            ((acc, v) => acc + v), 0);
    return (vboSizeBytes / (1024 * 1024)).toFixed(1);
}

VizServer.prototype.rememberVBOs = function (VBOs) {
    this.lastCompressedVBOs = VBOs;
    this.cachedVBOs[this.socket.client.id] = this.lastCompressedVBOs;
};

VizServer.prototype.beginStreaming = function (renderConfig, colorTexture, app) {

    // ========== BASIC COMMANDS
    this.rememberVBOs({});
    // this.socket.on('disconnect', () => {
    //     this.dispose();
    // });

    // Used for tracking what needs to be sent
    // Starts as all active, and as client caches, whittles down
    const activeBuffers = _.chain(renderConfig.models).pairs().filter((pair) => {
        const model = pair[1];
        return isBufServerSide(model);
    }).map((pair) => pair[0]).value();

    const activeTextures = _.chain(renderConfig.textures).pairs().filter((pair) => {
        const texture = pair[1];
        return isTextureServerSide(texture);
    }).map((pair) => pair[0]).value();

    const activePrograms = renderConfig.render;

    let requestedBuffers = activeBuffers,
        requestedTextures = activeTextures;

    // Knowing this helps overlap communication and computations
    this.socket.on('planned_binary_requests', (request) => {
        // console.log(this.socket);
        logger.trace({buffers: request.buffers, textures: request.textures}, 'Client sending planned requests');
        requestedBuffers = request.buffers;
        requestedTextures = request.textures;
    });

    logger.debug({activeBuffers, activeTextures, activePrograms}, 'Beginning stream');

    const graph = this.graph;
    const animationStep = this.animationStep;

    this.socket.on('interaction', (payload) => {
        // performance monitor here?
        // profiling.trace('Got Interaction');
        logger.trace({payload: payload}, 'Received interaction:');
        // TODO: Find a way to avoid flooding main thread waiting for GPU ticks.
        const defaults = {play: false, layout: false};
        animationStep.interact(_.extend(defaults, payload || {}));
    });

    // ============= EVENT LOOP

    // starts true, set to false whenever transfer starts, true again when acknowledged.
    const clientReady = new Rx.ReplaySubject(1);
    clientReady.onNext(true);
    this.socket.on('received_buffers', (time) => {
        perf.gauge('graph-viz:driver:viz-server, client end-to-end time', time);
        logger.trace('Client end-to-end time', time);
        clientReady.onNext(true);
    });
    // const updateVBOCommand = new Command('Update VBOs', 'vbo_update', this.socket);
    const emitOnSocket = Rx.Observable.bindCallback(this.socket.emit.bind(this.socket));

    clientReady.subscribe(logger.debug.bind(logger, 'CLIENT STATUS'), log.makeRxErrorHandler(logger, 'clientReady'));

    clientReady.debounceTime(200)
        .filter(Boolean)
        .filter(() => this.updateSession)
        .switchMap(() => this.updateSession({
            message: null,
            status: 'init',
            progress: 100 * 10/10
        })())
        .subscribe({});

    logger.trace('SETTING UP CLIENT EVENT LOOP ===================================================================');
    let step = 0;
    let lastVersions = null;
    let lastTick = 0;

    const graphObservable = graph;
    graph.expand((currentGraph) => {
        step++;

        logger.trace({activeBuffers: activeBuffers, step:step}, '0. Prefetch VBOs');

        return driver.fetchData(currentGraph, renderConfig, compress,
                                activeBuffers, lastVersions, activePrograms)
            .do((VBOs) => {
                logger.trace({step:step}, '1. pre-fetched VBOs for xhr2: ' + sizeInMBOfVBOs(VBOs.compressed) + 'MB');

                // tell XHR2 sender about it
                if (this.lastCompressedVBOs) {
                    _.extend(this.lastCompressedVBOs, VBOs.compressed);
                } else {
                    this.rememberVBOs(VBOs.compressed);
                }
                this.lastMetadata = {elements: VBOs.elements, bufferByteLengths: VBOs.bufferByteLengths};

                // if (saveAtEachStep) {
                //     persist.saveVBOs(defaultSnapshotName, VBOs, step);
                // }
            })
            .flatMap((VBOs) => {
                logger.trace({step: step}, '2. Waiting for client to finish previous');
                return clientReady
                    .filter(_.identity)
                    .take(1)
                    .do(() => {
                        logger.trace({step: step}, '2b. Client ready, proceed and mark as processing.');
                        clientReady.onNext(false);
                    })
                    .map(_.constant(VBOs));
            })
            .publish((source) => source.merge(source
                .filter(() => this.updateSession)
                .switchMap(() => this.updateSession({
                    message: null,
                    status: 'default',
                    progress: 100 * 10/10,
                })())
                .ignoreElements()
            ))
            // .publish((source) => !this.updateSession ? source : source.merge(source
            //     .let()
            //     .ignoreElements())
            // )
            .flatMap((VBOs) => {
                logger.trace('3. tell client about availability');

                // for each buffer transfer
                let clientAckStartTime = Date.now();
                const transferredBuffers = [];
                app.bufferTransferFinisher = function (bufferName) {
                    logger.trace({step: step}, '5a ?. sending a buffer %s', bufferName);
                    transferredBuffers.push(bufferName);
                    // console.log("Length", transferredBuffers.length, requestedBuffers.length);
                    if (transferredBuffers.length === requestedBuffers.length) {
                        const elapsedTime = (Date.now() - clientAckStartTime);
                        logger.trace('5b. started sending all');
                        logger.trace('Socket', '...client asked for all buffers in ' + elapsedTime + 'ms');
                    }
                };

                // const emitFnWrapper = Rx.Observable.fromCallback(socket.emit, socket);

                // notify of buffer/texture metadata
                // FIXME make more generic and account in buffer notification status
                const receivedAll = colorTexture.flatMap((eachColorTexture) => {
                    logger.trace('4a. unwrapped texture meta');

                    const textures = {
                        colorMap: _.pick(eachColorTexture, ['width', 'height', 'bytes'])
                    };

                    // FIXME: should show all active VBOs, not those based on prev req
                    const metadata =
                        _.extend(
                            _.pick(VBOs, ['bufferByteLengths', 'elements']),
                            {
                                textures: textures,
                                versions: {
                                    buffers: VBOs.versions,
                                    textures: {colorMap: 1}
                                },
                                step: step
                            });
                    lastVersions = VBOs.versions;
                    lastTick = VBOs.tick;

                    logger.trace('4b. notifying client of buffer metadata');
                    // performance monitor here?
                    // profiling.trace('===Sending VBO Update===');

                    // const emitter = socket.emit('vbo_update', metadata, (time) => {
                    // return time;
                    // });
                    // const observableCallback = Rx.Observable.bindNodeCallback(emitter);
                    // return observableCallback;
                    // return updateVBOCommand.sendWithObservableResult(metadata);
                    return emitOnSocket('vbo_update', metadata);
                })
                .do((clientElapsed) => {
                    logger.trace('6. client all received');
                    logger.trace('Socket', '...client received all buffers in ' + clientElapsed + 'ms');
                });

                return receivedAll;
            })
            .flatMap(() => {
                logger.trace('7. Wait for next animation step, updateVboSubject, or if we are behind on ticks');

                const filteredUpdateVbo = this.updateVboSubject.filter(_.identity);

                const behindOnTicks = graphObservable.take(1).filter(
                    (latestGraph) => latestGraph.simulator.versions.tick > lastTick);

                return Rx.Observable.merge(this.ticksMulti, filteredUpdateVbo, behindOnTicks)
                    .take(1)
                    .do(() => {
                        // Mark that we don't need to send VBOs independently of ticks anymore.
                        this.updateVboSubject.onNext(false);
                    })
                    .do(() => { logger.trace('8. next ready!'); });
            })
            .map(_.constant(currentGraph));
    })
    .subscribe(
        () => { logger.trace('9. LOOP ITERATED'); },
        log.makeRxErrorHandler(logger, 'Main loop failure'));
};


VizServer.prototype.dispose =
VizServer.prototype.unsubscribe = function () {
    logger.info('disconnecting', this.socket.client.id);
    delete this.app.bufferTransferFinisher;
    delete this.cachedVBOs[this.socket.client.id];
    delete this.lastCompressedVBOs;
    delete this.updateSession;
    delete this.socket;
    delete this.app;
    this.isActive = false;
};


VizServer.clHealthCheck = function () {
    try {
        const clContext = cljs.createSync(null);
        if (clContext !== null && clContext !== undefined) {
            return {success: true};
        } else {
            return {success: false, error: 'Null/Undefined CL context'};
        }
    } catch (err) {
        return {success: false, error: err.message};
    }
};

export default VizServer;

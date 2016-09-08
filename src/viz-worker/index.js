import _config from '@graphistry/config';
import { httpRoutes } from './routes/http';
import { socketRoutes } from './routes/socket';
import VizServer from './simulator/server-viz';
import { cache as Cache } from '@graphistry/common';
import { reloadHot } from 'viz-worker/reloadHot';
import removeExpressRoute from 'express-remove-route';
import { Observable, Subject, Subscription } from 'rxjs';
import { logger as commonLogger } from '@graphistry/common';
import { getDataSourceFactory } from 'viz-shared/middleware';
import { loadViews, loadLabels, loadVGraph,
         loadWorkbooks, sendFalcorUpdate } from './services';

const config = _config();
const logger = commonLogger.createLogger('viz-worker:index.js');
const s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE);

export function vizWorker(app, server, sockets, caches) {

    const { requests } = server;
    const { vbos = {},
            nBodiesById = {},
            workbooksById = {} } = caches;

    const loadConfig = () => Observable.of(config);
    const loadWorkbooksById = loadWorkbooks(workbooksById, config, s3Cache);
    const loadViewsById = loadViews(workbooksById, nBodiesById, config, s3Cache);
    const loadLabelsByIndexAndType = loadLabels(workbooksById, nBodiesById, config, s3Cache);

    const routeServices = {
        loadConfig,
        loadViewsById,
        loadWorkbooksById,
        loadLabelsByIndexAndType
    };

    const getDataSource = getDataSourceFactory(routeServices);
    const expressAppRoutes = httpRoutes(routeServices, reloadHot(module));

    return Observable
        .using(removeExpressRoutesOnDispose, addExpressRoutesOnSubscribe)
        .mergeMap(() => requests.merge(sockets.map(enrichLogs)
            .mergeMap(({ socket, metadata }) => {
                // debugger
                const sendUpdate = sendFalcorUpdate(socket, getDataSourceFactory(routeServices));
                const socketIORoutes = socketRoutes(routeServices, socket);
                const vizServer = new VizServer(app, socket, vbos, metadata);
                return Observable.using(
                    removeSocketHandlersOnSocketDispose(socket, vizServer, socketIORoutes),
                    addSocketHandlersOnSocketSubscribe(socket, vizServer, socketIORoutes)
                )
                .multicast(() => new Subject(), (shared) => Observable.merge(
                    shared, shared
                        .filter((x) => x && x.type === 'connection')
                        .take(1)
                        .mergeMap(seedVizServerOnSocketConnection(vizServer, sendUpdate))
                        .ignoreElements()
                ));
            })
        ))
        .takeWhile((x) => !x || (x && x.type !== 'disconnect'))

    function addExpressRoutesOnSubscribe(subscription) {

        expressAppRoutes.forEach(({ route, all, use, get, put, post, delete: del }) => {
            const idx = route ? 1 : 0;
            const args = route ? [route] : [];
            if (all) {
                args[idx] = all;
                app.all.apply(app, args);
            } else if (use) {
                args[idx] = use;
                app.use.apply(app, args);
            } else {
                if (get) {
                    args[idx] = get;
                    app.get.apply(app, args);
                }
                if (put) {
                    args[idx] = put;
                    app.put.apply(app, args);
                }
                if (post) {
                    args[idx] = post;
                    app.post.apply(app, args);
                }
                if (del) {
                    args[idx] = del;
                    app.delete.apply(app, args);
                }
            }
        });

        return Observable.of({});
    }

    function removeExpressRoutesOnDispose() {
        return new Subscription(function disposeVizWorker() {
            expressAppRoutes
                .filter(({ route }) => route)
                .forEach(({ route }) => {
                    try {
                        removeExpressRoute(app, route)
                    } catch(e) {
                        // todo: log routes we can't remove?
                    }
                });
        });
    }

    function addSocketHandlersOnSocketSubscribe(socket, vizServer, socketIORoutes) {
        return function addSocketHandlersOnSocketSubscribe(subscription) {

            socketIORoutes.forEach(({ event, handler }) => {
                socket.on(event, handler);
            });

            const disconnect = Observable.fromEvent(socket, 'disconnect', () => (
                                             { socket, type: 'disconnect' }));
            const connection = Observable.of({ socket, type: 'connection' });

            return connection.concat(disconnect);
        }
    }

    function removeSocketHandlersOnSocketDispose(socket, vizServer, socketIORoutes) {
        return function removeSocketHandlersOnSocketDispose() {
            const composite = new Subscription();
            composite.add(vizServer);
            composite.add(function disposeVizWorkerSocket() {
                socketIORoutes.forEach(({ event, handler }) => {
                    socket.removeListener(event, handler);
                });
                socket.disconnect();
            });
            return composite;
        }
    }

    function enrichLogs(socket) {

        const { handshake: { query, query: { dataset, debugId, usertag }},
                request: { connection: { remoteAddress }}} = socket;

        const metadata = { dataset, debugId, usertag };

        commonLogger.addMetadataField(metadata);

        logger.info({ ip: remoteAddress, query }, 'Connection Info');

        return { socket, metadata };
    }

    function seedVizServerOnSocketConnection(vizServer, sendUpdate) {
        return function seedVizServer({ socket }) {

            const { handshake: { query: options = {} }} = socket;
            const { workbook: workbookId } = options;

            if (workbookId == null) {
                return Observable.throw(new Error('Socket connection with no workbook Id'));
            }

            const workbookIds = [workbookId];

            return loadWorkbooksById({
                workbookIds, options
            })
            .mergeMap(({ workbook }) => {
                const { value: viewRef } = workbook.views.current;
                const viewIds = [viewRef[viewRef.length - 1]];
                return loadViewsById({
                    workbookIds, viewIds, options
                });
            })
            .do(({ workbook, view }) => {
                const { nBody } = view;
                nBody.socket = socket;
                nBody.server = vizServer;
                logger.trace('assigned socket and viz-server to nBody');
            })
            .mergeMap(
                ({ workbook, view }) => loadVGraph(view, config, s3Cache),
                ({ workbook},view) => ({ workbook, view })
            )
            .mergeMap(({ workbook, view }) => {

                logger.trace('loaded nBody vGraph');

                const { nBody, scene } = view;
                const { interactions, interactionsLoop } = nBody;

                vizServer.animationStep = {
                    interact(x) {
                        interactions.next(x);
                    }
                };

                // TODO: refactor server-viz to remove dependency on
                // stateful shared Subjects
                vizServer.workbookDoc.next(workbook);
                vizServer.viewConfig.next(view);
                vizServer.renderConfig.next(scene);

                return interactionsLoop;
            })
            .do((nBody) => {
                vizServer.ticksMulti.next(nBody);
            })
            .multicast(() => new Subject(), (shared) => Observable.merge(
                shared.skip(1),
                shared.take(1).do((nBody) => {
                    logger.trace('ticked graph');
                    vizServer.graph.next(nBody);
                })
                .mergeMap(
                    (nBody) => sendUpdate(
                        `workbooks.open.views.current.scene.hints`,
                        `workbooks.open.views.current.expressions.length`
                    ),
                    (nBody) => nBody
                )
            ));
        }
    }
}

import _config from '@graphistry/config';
import { cache as Cache } from '@graphistry/common';
import { logger as commonLogger } from '@graphistry/common';

import { Observable, Subject, Subscription } from 'rxjs';
import removeExpressRoute from 'express-remove-route';

import { services } from 'viz-worker/services';
import { reloadHot } from 'viz-worker/reloadHot';
import { httpRoutes } from 'viz-worker/routes/http';
import { socketRoutes } from 'viz-worker/routes/socket';
import VizServer from 'viz-worker/simulator/server-viz';
import { addExpressRoutes, removeExpressRoutes,
         addSocketHandlers, removeSocketHandlers } from 'viz-worker/startup';

import { getDataSourceFactory } from 'viz-shared/middleware';

export function vizWorker(app, server, sockets, caches) {

    const config = _config();
    const { requests } = server;
    const logger = commonLogger.createLogger('viz-worker:index.js');

    const vbos = caches.vbos || (caches.vbos = {});
    const s3DatasetCache = caches.s3DatasetCache || (caches.s3DatasetCache = new Cache(config.LOCAL_DATASET_CACHE_DIR, config.LOCAL_DATASET_CACHE));
    const s3WorkbookCache = caches.s3WorkbookCache || (caches.s3WorkbookCache = new Cache(config.LOCAL_WORKBOOK_CACHE_DIR, config.LOCAL_WORKBOOK_CACHE));
    const nBodiesById = caches.nBodiesById = {};
    const workbooksById = caches.workbooksById || (caches.workbooksById = {});

    const routeServices = services({
        vbos, config, s3DatasetCache, s3WorkbookCache, nBodiesById, workbooksById
    });

    const getDataSource = getDataSourceFactory(routeServices);
    const expressRoutes = httpRoutes(routeServices, reloadHot(module));
    const { loadWorkbooksById, loadViewsById,
            loadVGraph, maskDataframe, sendFalcorUpdate } = routeServices;

    return Observable.using(
            removeExpressRoutes(app, expressRoutes),
            addExpressRoutes(app, expressRoutes)
        )
        .mergeMap(() => requests.merge(sockets
            .let(timeoutIfNoSocketConnectionIfNotRunningLocally)
            .map(enrichLogs)
            .mergeMap(({ socket, metadata }) => {

                const sendUpdate = sendFalcorUpdate(socket, getDataSource);
                const socketIORoutes = socketRoutes(routeServices, socket);
                const vizServer = new VizServer(app, socket, vbos, metadata);

                return Observable.using(
                    removeSocketHandlers(socket, vizServer, socketIORoutes),
                    addSocketHandlers(socket, vizServer, socketIORoutes)
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

    function timeoutIfNoSocketConnectionIfNotRunningLocally(source) {
        if (config.ENVIRONMENT === 'local') {
            return source;
        }
        return source
            .timeout(config.SOCKET_CLAIM_TIMEOUT * 1000)
            .do(() => logger.info('Socket connected before timeout'))
            .catch((e) => {
                logger.error({ err: e }, 'Worker socket connection timeout.');
                return Observable.throw({
                    error: e,
                    message: `Worker socket connection timeout.`
                });
            })
            .take(1);
    }

    function enrichLogs(socket) {

        const { handshake: { query, query: { dataset, debugId, usertag }},
                request: { connection: { remoteAddress }}} = socket;

        const metadata = { dataset, debugId };
        commonLogger.addMetadataField(metadata);

        logger.info({ req: { ...socket.handshake, ...socket.request } }, 'Connection Info');

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
                ({ workbook, view }) => loadVGraph(view, config, s3DatasetCache),
                ({ workbook},view) => ({ workbook, view })
            )
            .mergeMap(({ workbook, view }) => {

                logger.trace('loaded nBody vGraph');

                const { nBody } = view;
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
                vizServer.renderConfig.next(nBody.scene);

                return interactionsLoop.map((nBody) => ({ view, nBody }));
            })
            .multicast(() => new Subject(), (shared) => Observable.merge(
                shared.skip(1),
                shared.take(1)
                    .mergeMap(
                        ({ view, nBody }) => maskDataframe({ view }),
                        ({ view, nBody }) => ({ view, nBody })
                    )
                    .do(() => logger.trace('finished initial dataframe mask'))
                    .mergeMap(
                        ({ nBody }) => sendUpdate({
                            invalidated: [
                                `workbooks.open.views.current.labelsByType`,
                                `workbooks.open.views.current.inspector.rows`,
                                `workbooks.open.views.current.componentsByType`
                            ],
                            paths: [
                                `workbooks.open.views.current.columns.length`,
                                `workbooks.open.views.current.histograms.length`,
                                `workbooks.open.views.current.inspector.tabs.length`,
                                `workbooks.open.views.current.scene.renderer['edges', 'points'].elements`
                            ]
                        }).takeLast(1),
                        ({ nBody }) => ({ nBody })
                    )
                    .do(() => logger.trace('finished sending initial falcor update'))
                    .do(({ nBody }) => {
                        logger.trace('ticked graph');
                        vizServer.graph.next(nBody);
                    })
            ))
            .do(({ nBody }) => vizServer.ticksMulti.next(nBody));
        }
    }
}

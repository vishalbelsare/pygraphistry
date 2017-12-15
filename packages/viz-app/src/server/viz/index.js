import path from 'path';
import express from 'express';
import * as bodyParser from 'body-parser';
import * as archiver from 'archiver';

import configureRender from './render';
import configureSocket from './socket';
import configureVBOHandler from './vbos';
import configureVGraphPipeline from './pipeline';
import { textureHandler, colorTexture } from './texture';
import { createLogger } from '@graphistry/common/logger';

const logger = createLogger('viz-app:server:viz');
import { maybeTagServer } from '../support/tagSession';

import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
import { renderToString } from 'react-dom/server';
import { cache as Cache } from '@graphistry/common';

import configureServices from 'viz-app/worker/services';
import configureFalcorRouter from 'viz-app/router/falcor';
import VizServer from 'viz-app/worker/simulator/server-viz';

function configureVizWorker(config, activeCB, io) {
    let services,
        getDataSource,
        vbos = {};
    const nBodiesById = {},
        workbooksById = {};
    const s3DatasetCache = new Cache(config.LOCAL_DATASET_CACHE_DIR, config.LOCAL_DATASET_CACHE);
    const s3WorkbookCache = new Cache(config.LOCAL_WORKBOOK_CACHE_DIR, config.LOCAL_WORKBOOK_CACHE);
    const servicesConfig = {
        vbos,
        config,
        nBodiesById,
        workbooksById,
        s3DatasetCache,
        s3WorkbookCache
    };

    getDataSource = configureFalcorRouter((services = configureServices(servicesConfig)));

    // Hot reload the Falcor Router services
    if (module.hot) {
        module.hot.accept('viz-app/worker/services', () => {
            let nextConfigureServices = require('viz-app/worker/services').default; // eslint-disable-line global-require
            getDataSource = configureFalcorRouter(
                (services = nextConfigureServices(servicesConfig))
            );
        });
    }

    let appSocket = null;
    const getSocket = () => appSocket;
    const app = express.Router();

    // Register the texture request handler
    app.get('/texture', textureHandler);
    // Register the vbo request handler
    app.get('/vbo', configureVBOHandler(app, getSocket, vbos));
    // NB: Normally, nginx routes `/error` to central, so it can log client errors instead of
    // viz-app. However, if you're running locally (with no central or nginx), it's convienant
    // to log client erros with your normal log output (usually to the terminal).
    app.post('/error', bodyParser.json({ extended: true, limit: '512kb' }), (req, res) => {
        logger.error(req.body, `Client error: ${req.body.msg || 'no message'}`);
        res.status(200).send();
    });
    // Setup the public directory so that we can serve static assets.
    app.use(`/graph`, express.static(path.join(process.cwd(), './www/public')));
    app.use(`/public`, express.static(path.join(process.cwd(), './www/public')));
    if (config.ENVIRONMENT === 'local') {
        app.use(`/static/viz-app`, express.static(path.join(process.cwd(), './www/public')));
    }

    // Register server-side rendering middleware
    const loadVGraphPipeline = configureVGraphPipeline(config, s3DatasetCache);
    const renderHTML = configureRender(config, request =>
        getDataSource(request, { streaming: false })
    );
    const setupClientSocket = configureSocket(io, config, request =>
        getDataSource(request, { streaming: true })
    );

    //override on graph.html load
    let zipHandler = undefined; // { dataframe }
    app.get(`/graph/graphistry.zip`, (req, res) => {
        if (!zipHandler) {
            logger.error('Called /graph/graph.zip before initialized session');
            return res.status(404).send({ error: 'No active session' });
        }

        //Races on dataframe read; aim for safety when we go to (immutable) arrows
        Observable.of(zipHandler.dataframe)
            .switchMap(dataframe =>
                Observable.combineLatest(
                    Observable.fromPromise(dataframe.formatAsCSV('point')),
                    Observable.fromPromise(dataframe.formatAsCSV('event')),
                    Observable.fromPromise(dataframe.formatAsCSV('edge'))
                ).do(([nodes, events, edges]) => {
                    const archive = archiver('zip');

                    archive.on('error', function(err) {
                        logger.error('error /graph/graph.zip', err);
                        res.status(500).send({ error: 'Internal server error' });
                    });

                    archive.on('end', function() {
                        logger.info('graphistry.zip archive wrote %d bytes', archive.pointer());
                    });

                    res.attachment('graphistry.zip');
                    archive.pipe(res);
                    archive.append(nodes, { name: 'nodes.csv' });
                    archive.append(events, { name: 'events.csv' });
                    archive.append(edges, { name: 'edges.csv' });
                    archive.finalize();
                })
            )
            .subscribe(
                () => null,
                e => {
                    logger.error('/graph/graph.zip', e);
                    return res.status(500).send({ error: 'Internal server error' });
                }
            );
    });

    app.get(`/graph/graph.html`, (req, res) => {
        activeCB(null, true);
        maybeTagServer(req);

        let { query: { workbook: workbookId } = {} } = req;

        if (typeof workbookId !== 'string') {
            if (config.ENVIRONMENT !== 'local') {
                return res.status(500).send(renderToString(<pre>Invalid workbook</pre>));
            }
            req.query.workbook = workbookId = simpleflake().toJSON();
        }

        appSocket = null;

        const { sendFalcorUpdate } = services;
        const sendUpdate = sendFalcorUpdate(getSocket, getDataSource);
        const updateSession = sendSessionUpdate.bind(null, sendUpdate);
        // load the workbook, download the dataset, decode the vGraph, and load it into the simulator
        const loadAndRunVisualization = loadVGraphPipeline(
            workbookId,
            { ...req.query },
            { ...services, updateSession }
        );

        // load, render, and send graph.html to the client
        const loadAndRenderHTML = renderHTML(req, res).do(({ status, payload }) => {
            res.status(status).send(payload);
        });

        // setup the socket.io connection listeners and
        const establishVizConnection = setupClientSocket(req, res)
            .do({ error: activeCB, complete: activeCB.bind(null, null, false) })
            // flatMap the socket into a vizServer with Observable.using, so
            // the vizServer gets disposed when the subscription to the whole
            // Observable is disposed (on error, complete, or unsubscribe).
            .mergeMap(({ socket, metadata }) =>
                Observable.using(
                    () => new VizServer(app, (appSocket = socket), vbos, metadata, colorTexture),
                    vizServer => Observable.of({ socket, vizServer }).concat(Observable.never())
                )
            );

        // Render the page, establish the socket comms, and load the viz runner in parallel
        Observable.combineLatest(
            establishVizConnection,
            loadAndRunVisualization,
            loadAndRenderHTML.take(1),
            ({ socket, vizServer }, { workbook, view }) => ({ workbook, view, socket, vizServer })
        )
            // On the first event, hook up the VizServer and the interactions Subject.
            // Let all the other events pass through. TODO: deprecate put this in the
            // graph compute pipeline!
            .publish(updates =>
                updates.skip(1).merge(
                    updates
                        .take(1)
                        .let(sendPostVGraphLoadedUpdate(sendUpdate, updateSession))
                        .map(({ workbook, view, socket, vizServer }) => {
                            const { nBody } = view;
                            zipHandler = { dataframe: nBody.dataframe };
                            nBody.server = vizServer;
                            const { interactions } = nBody;
                            vizServer.updateSession = sendSessionUpdate.bind(
                                null,
                                sendUpdate,
                                view
                            );
                            vizServer.animationStep = {
                                interact(x) {
                                    interactions.next(x);
                                }
                            };
                            // TODO: refactor server-viz to remove dependency on stateful shared Subjects
                            logger.trace('ticked graph');
                            vizServer.graph.next(nBody);
                            vizServer.renderConfig.next(nBody.scene);
                            return { view, socket, vizServer };
                        })
                )
            )
            // legacy: pump the `nBody` into the vizServer VBO loop
            .do(({ view, vizServer }) => vizServer.ticksMulti.next(view.nBody))
            .subscribe({ error: activeCB, complete: activeCB.bind(null, null, false) });
    });

    return app;
}

export { configureVizWorker };
export default configureVizWorker;

function sendSessionUpdate(sendUpdate, view, session) {
    let _view = view;
    let _session = session || view;
    return function letSendSessionUpdate(source = Observable.of({})) {
        return source.mergeMap(({ workbook, view }) => {
            _view = view || _view;
            _view.session = _session;
            const workbookPath = workbook ? `workbooksById['${workbook.id}']` : 'workbooks.open';
            const viewPath = `${workbookPath}.viewsById['${_view.id}']`;
            return sendUpdate({
                paths: [`${viewPath}.session['status', 'message', 'progress']`]
            }).takeLast(1);
        }, args => args);
    };
}

function sendPostVGraphLoadedUpdate(sendUpdate, updateSession) {
    return function letSendPostVGraphLoadedUpdate(source) {
        return source
            .mergeMap(({ workbook, view }) => {
                const viewPath = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;
                return sendUpdate({
                    invalidated: [
                        `${viewPath}.encodings`,
                        `${viewPath}.columns.length`,
                        `${viewPath}.inspector.rows`,
                        `${viewPath}.histogramsById`,
                        `${viewPath}['labelsByType', 'componentsByType']`
                    ],
                    paths: [
                        `${viewPath}.columns.length`,
                        `${viewPath}.histograms.length`,
                        `${viewPath}.inspector.tabs.length`,
                        `${viewPath}.scene.renderer['edges', 'points'].elements`
                    ]
                }).takeLast(1);
            }, args => args)
            .let(
                updateSession({
                    status: 'init',
                    progress: 100 * 10 / 10,
                    message: 'Loading graph'
                })
            );
    };
}

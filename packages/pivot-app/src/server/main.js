import express from 'express';
import { expressApp, socketServer } from './app.js';
import bodyParser from 'body-parser';
import path from 'path';
import mkdirp from 'mkdirp';
import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import {
    getDataSourceFactory,
    falcorModelFactory
 } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';
import { FalcorPubSubDataSink } from '@graphistry/falcor-socket-datasource';
import {
    createAppModel,
    makeTestUser
} from '../shared/models';
import {
    wrapServices,
    loadAppFactory,
    connectorStore, listConnectors, checkConnector,
    userStore, templateStore, listTemplates,
    listInvestigations, investigationStore,
    createInvestigation, cloneInvestigationsById, saveInvestigationsById,
    removeInvestigationsById, switchActiveInvestigation,
    pivotStore, insertPivot, splicePivot, searchPivot,
    uploadGraph
} from '../shared/services';

import conf from './config.js';
import logger from '../shared/logger.js';
const log = logger.createLogger(__filename);

import { HealthChecker } from './HealthChecker.js';
const healthcheck = HealthChecker();


Error.stackTraceLimit = 3;

const buildNum = __BUILDNUMBER__ === undefined ? 'local build' : `build #${__BUILDNUMBER__}`;
const buildDesc = {branch:__GITBRANCH__, commit:__GITCOMMIT__, build:__BUILDNUMBER__, builton: __BUILDDATE__};
log.info(buildDesc, `Starting ${buildNum}`);

const pathPrefix = conf.get('pivotApp.dataDir');
const investigationPath = path.resolve(pathPrefix, 'investigations');
const pivotPath = path.resolve(pathPrefix, 'pivots');
mkdirp.sync(investigationPath);
mkdirp.sync(pivotPath);

listInvestigations(investigationPath)
    .map(investigations =>
        makeTestUser(investigations, listTemplates(), listConnectors(), conf.get('graphistry.key'),
                     conf.get('graphistry.host'))
    )
    .do(init)
    .subscribe(
        () => log.info('Pivot-App initialized'),
        (e) => log.error(e)
    );

function init(testUser) {
    const app = createAppModel(testUser);
    const loadApp = loadAppFactory(app);

    const { loadUsersById } = userStore(loadApp);
    const { loadTemplatesById } = templateStore(loadApp);
    const {
        loadInvestigationsById,
        unloadInvestigationsById,
        persistInvestigationsById,
        unlinkInvestigationsById,
    } = investigationStore(loadApp, investigationPath);
    const {
        loadPivotsById,
        unloadPivotsById,
        persistPivotsById,
        unlinkPivotsById,
    } = pivotStore(loadApp, pivotPath);


    const { loadConnectorsById } = connectorStore(loadApp);

    const routeServices = wrapServices({
        loadApp,
        loadUsersById,
        loadTemplatesById,
        loadConnectorsById,
        loadInvestigationsById,
        unloadInvestigationsById,
        persistInvestigationsById,
        unlinkInvestigationsById,
        createInvestigation,
        switchActiveInvestigation,
        cloneInvestigationsById,
        saveInvestigationsById,
        removeInvestigationsById,
        loadPivotsById,
        unloadPivotsById,
        persistPivotsById,
        unlinkPivotsById,
        insertPivot, splicePivot, searchPivot,
        checkConnector,
        uploadGraph
    });

    const modules = reloadHot(module);
    const getDataSource = getDataSourceFactory(routeServices);

    setupRoutes(modules, getDataSource);
    setupSocketRoutes(getDataSource);
}

function setupRoutes(modules, getDataSource) {
    const mountPoint = '/pivot';
    expressApp.use(
	`${mountPoint}/model.json`,
        bodyParser.urlencoded({ extended: false }),
        falcorMiddleware(getDataSource)
    );

    const roots = [':activeScreen', ':activeScreen/:investigationId'];
    const router = express.Router();
    roots.forEach(root => {

        router.get(`/${root}`, (req, res) => {
            const getFalcorModel = falcorModelFactory(getDataSource);
            return renderMiddleware(getFalcorModel, modules)(req, res);
        });

    });
    
    expressApp.get(`${mountPoint}/healthcheck`, function(req, res) {
        const health = healthcheck();
        log.info({...health, req, res}, 'healthcheck');
        res.status(health.clear.success ? 200 : 500).json({...health.clear});
    });

    //useful for testing
    expressApp.get(`${mountPoint}/echo`, function(req, res) {
        log.info('echo', { ...(req.query||{}) });
        res.status(200).json(req.query);
    });

    expressApp.get(`${mountPoint}/`, (req, res) => res.redirect(`${mountPoint}/home`));

    expressApp.use(`${mountPoint}`, router);
    expressApp.get('*', (req, res) => res.status(404).send('Not found'));

}

function setupSocketRoutes(getDataSource) {
    socketServer.on('connection', (socket) => {
        const { handshake: { query = {} }} = socket;
        const sink = new FalcorPubSubDataSink(socket, () => getDataSource({
            user: { userId: query.userId }
        }, true));

        socket.on(sink.event, sink.response);
        socket.on('disconnect', onDisconnect);

        function onDisconnect() {
            socket.removeListener(sink.event, sink.response);
            socket.removeListener('disconnect', onDisconnect);
            log.info(`User ${query.userId} successfully disconnected.`);
        }
    });
}

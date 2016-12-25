import express from 'express';
import expressApp from './app.js';
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
import {
    createAppModel,
    makeTestUser
} from '../shared/models';
import {
    wrapServices,
    loadApp,
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

    const { loadUsersById } = userStore(loadApp(app));
    const { loadTemplatesById } = templateStore(loadApp(app));
    const {
        loadInvestigationsById,
        unloadInvestigationsById,
        persistInvestigationsById,
        unlinkInvestigationsById,
    } = investigationStore(loadApp(app), investigationPath);
    const {
        loadPivotsById,
        unloadPivotsById,
        persistPivotsById,
        unlinkPivotsById,
    } = pivotStore(loadApp(app), pivotPath);


    const { loadConnectorsById } = connectorStore(loadApp(app));

    const routeServices = wrapServices({
        loadApp: loadApp(app),
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
}

function setupRoutes(modules, getDataSource) {
    expressApp.use(
        '/model.json',
        bodyParser.urlencoded({ extended: false }),
        falcorMiddleware(getDataSource)
    );

    const roots = ['home', 'investigation', 'connectors'];
    roots.forEach(root => {
        const router = express.Router();

        router.get(`*`, (req, res) => {
            const getFalcorModel = falcorModelFactory(getDataSource);
            return renderMiddleware(getFalcorModel, modules)(req, res);
        });

        expressApp.use(`/${root}`, router);
    });

    expressApp.get('/', (req, res) => res.redirect('/home'));
    expressApp.get('*', (req, res) => res.status(404).send('Not found'));
}

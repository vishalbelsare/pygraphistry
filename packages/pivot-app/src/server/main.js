import expressApp from './app.js';
import bodyParser from 'body-parser';
import bunyan from 'bunyan';
import path from 'path';
import mkdirp from 'mkdirp';
import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import { getDataSourceFactory } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';
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

    expressApp.post('/error', bodyParser.json({limit: '512kb'}), function (req, res) {
        const record = req.body;
        log[bunyan.nameFromLevel[record.level]](record, record.msg);
        res.status(204).send();
    });
    expressApp.use(
        '/model.json',
        bodyParser.urlencoded({ extended: false }),
        falcorMiddleware(getDataSource)
    );
    expressApp.use('/index.html', renderMiddleware(getDataSource, modules));
    expressApp.use('/', renderMiddleware(getDataSource, modules));
}

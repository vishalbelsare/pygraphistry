import expressApp from './app.js'
import bodyParser from 'body-parser';
import path from 'path';
import mkdirp from 'mkdirp';
import { Observable } from 'rxjs';
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
    loadApp,
    userStore, templateStore, listTemplates,
    listInvestigations, investigationStore,
    createInvestigation, cloneInvestigationsById, removeInvestigationsById,
    pivotStore, insertPivot, splicePivot, searchPivot,
    uploadGraph
} from '../shared/services';

import conf from './config.js';
import logger from '../shared/logger.js';
const log = logger.createLogger('pivot-app', __filename);

Error.stackTraceLimit = 3;

const pathPrefix = conf.get('pivotApp.dataDir');
const investigationPath = path.resolve(pathPrefix, 'investigations');
const pivotPath = path.resolve(pathPrefix, 'pivots');
mkdirp.sync(investigationPath);
mkdirp.sync(pivotPath);


listInvestigations(investigationPath)
    .map(investigations =>
        makeTestUser(investigations, listTemplates(), conf.get('graphistry.key'),
                     conf.get('graphistry.host'))
    )
    .do(init)
    .subscribe(
        () => log.info('Pivot-App initialized'),
        (e) => log.error(e)
    )

function init(testUser) {
    const app = createAppModel(testUser);

    const { loadUsersById } = userStore(loadApp(app));
    const { loadTemplatesById } = templateStore(loadApp(app));
    const {
        loadInvestigationsById,
        saveInvestigationsById,
        deleteInvestigationsById
    } = investigationStore(loadApp(app), investigationPath);
    const {
        loadPivotsById,
        savePivotsById,
        deletePivotsById
    } = pivotStore(loadApp(app), pivotPath);

    const routeServices = wrapServices({
        loadApp: loadApp(app),
        loadUsersById,
        loadTemplatesById,
        loadInvestigationsById,
        saveInvestigationsById,
        deleteInvestigationsById,
        removeInvestigationsById,
        createInvestigation,
        cloneInvestigationsById,
        loadPivotsById,
        savePivotsById,
        deletePivotsById,
        insertPivot, splicePivot, searchPivot,
        uploadGraph
    });

    const modules = reloadHot(module);
    const getDataSource = getDataSourceFactory(routeServices);

    expressApp.use('/index.html', renderMiddleware(getDataSource, modules));
    expressApp.use(bodyParser.urlencoded({ extended: false }));
    expressApp.use('/model.json', falcorMiddleware(getDataSource));

    expressApp.use('/', renderMiddleware(getDataSource, modules));
}

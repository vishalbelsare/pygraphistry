import expressApp from './app.js'
import bodyParser from 'body-parser';
import path from 'path';
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
    loadApp,
    userStore, templateStore, listTemplates,
    listInvestigations, investigationStore,
    createInvestigation, cloneInvestigationsById, removeInvestigationsById,
    pivotStore, insertPivot, splicePivot, searchPivot,
    uploadGraph
} from '../shared/services';
import logger from '@graphistry/common/logger2.js';
const log = logger.createLogger('pivot-app', __filename);


const pathPrefix = process.env.PIVOTAPP_DATADIR || 'tests/appdata';
const investigationPath = path.resolve(pathPrefix, 'investigations');
const pivotPath = path.resolve(pathPrefix, 'pivots');

listInvestigations(investigationPath)
    .map(investigations => makeTestUser(investigations, listTemplates()))
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

    const routeServices = {
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
    };

    const modules = reloadHot(module);
    const getDataSource = getDataSourceFactory(routeServices);

    expressApp.use('/index.html', renderMiddleware(getDataSource, modules));
    expressApp.use(bodyParser.urlencoded({ extended: false }));
    expressApp.use('/model.json', falcorMiddleware(getDataSource));

    expressApp.use('/', renderMiddleware(getDataSource, modules));
}

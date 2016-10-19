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
    userStore, templateStore,
    listInvestigations, investigationStore,
    createInvestigation, cloneInvestigationsById, removeInvestigationsById,
    pivotStore, insertPivot, splicePivot, searchPivot,
    uploadGraph
} from '../shared/services';


const pathPrefix = process.env.PIVOTAPP_DATADIR || 'tests2/appdata';
const investigationPath = path.resolve(pathPrefix, 'investigations');
const pivotPath = path.resolve(pathPrefix, 'pivots');

listInvestigations(investigationPath)
    .map(makeTestUser)
    .do(init)
    .subscribe(
        () => console.log('Initialized'),
        (e) => console.error(e)
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

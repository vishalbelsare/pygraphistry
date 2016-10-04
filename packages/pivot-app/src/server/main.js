import expressApp from './app.js'
import bodyParser from 'body-parser';
import { Observable } from 'rxjs';
import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import { getDataSourceFactory } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';
import { app as createApp } from '../shared/models';
import {
    loadApp,
    userStore,
    listInvestigations, investigationStore,
    createInvestigation, cloneInvestigationsById,
    pivotStore, insertPivot, splicePivot, searchPivot,
    uploadGraph
} from '../shared/services';


const investigationPath = 'tests/appdata/investigations';
const pivotPath = 'tests/appdata/pivots';

listInvestigations(investigationPath)
    .do(init)
    .subscribe(
        () => console.log('Initialized'),
        (e) => console.error(e)
    )

function init(investigations) {
    const app = createApp(investigations);

    const {loadUsersById} = userStore(loadApp(app));
    const {loadInvestigationsById, saveInvestigationsById} = investigationStore(loadApp(app),
                                                                                investigationPath);
    const {loadPivotsById, savePivotsById} = pivotStore(loadApp(app), pivotPath);

    const routeServices = {
        loadApp: loadApp(app),
        loadUsersById,
        loadInvestigationsById,
        saveInvestigationsById,
        createInvestigation,
        cloneInvestigationsById,
        loadPivotsById: loadPivotsById,
        savePivotsById: savePivotsById,
        insertPivot, splicePivot, searchPivot,
        uploadGraph
    };

    const modules = reloadHot(module);
    const getDataSource = getDataSourceFactory(routeServices);

    expressApp.use('/index.html', renderMiddleware(getDataSource, modules));
    expressApp.use('/graph.html', function(req, res) {
        const { query: options = {} } = req;
        res.type('html').send(`
            <!DOCTYPE html>
            <html lang='en-us'>
                <body>
                    <h1>total: ${options.total}</h1>
                </body>
            </html>
        `);
    });

    expressApp.use(bodyParser.urlencoded({ extended: false }));
    expressApp.use('/model.json', falcorMiddleware(getDataSource));

    expressApp.use('/', renderMiddleware(getDataSource, modules));
}

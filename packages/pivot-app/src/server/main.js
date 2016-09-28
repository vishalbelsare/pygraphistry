import expressApp from './app.js'
import bodyParser from 'body-parser';
import glob from 'glob';
import fs from 'fs';
import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';

import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import { getDataSourceFactory } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';
import { app as createApp } from '../shared/models';
import {
    loadApp,
    loadInvestigations, saveInvestigations, createInvestigation,
    loadPivots, insertPivot, splicePivot, searchPivot,
    uploadGraph
} from '../shared/services';


const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);
const globAsObservable = Observable.bindNodeCallback(glob);

globAsObservable('tests/appdata/investigations/*.json')
    .flatMap(x => x)
    .flatMap(file => {
        return readFileAsObservable(file).map(JSON.parse);
    }).reduce(
        (acc, x) =>acc.concat([x]),
        []
    ).subscribe(
        investigations => init(investigations),
        x => console.error(x)
    );

function init(investigations) {
    const app = createApp(investigations);

    const routeServices = {
        loadApp: loadApp(app),
        loadInvestigationsById: loadInvestigations(loadApp(app)),
        saveInvestigationsById: saveInvestigations(loadApp(app), 'tests/appdata/investigations'),
        createInvestigation,
        loadPivotsById: loadPivots(loadApp(app), 'tests/appdata/pivots/*.json'),
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

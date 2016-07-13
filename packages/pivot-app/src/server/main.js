import expressApp from './app.js'
import bodyParser from 'body-parser';

import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import { getDataSourceFactory } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

import { app as createApp, row as createRow } from '../shared/models';
import { loadApp, loadRows, insertRow, spliceRow, calcTotals } from '../shared/services';

const cols = [
    { name: 'Column A' },
    { name: 'Column B' },
    { name: 'Column C' },
];

const rows = Array.from({ length: 3 }, (x, index) => (
    createRow(cols)
));

const app = createApp(cols, rows);

const routeServices = {
    loadApp: loadApp(app),
    insertRow, spliceRow, calcTotals,
    loadRowsById: loadRows(loadApp(app)),
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

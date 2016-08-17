import expressApp from './app.js'
import bodyParser from 'body-parser';

import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import { getDataSourceFactory } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

import { app as createApp, row as createRow } from '../shared/models';
import { loadApp, loadPivots, loadRows, insertRow, spliceRow, calcTotals, searchPivot, uploadGraph } from '../shared/services';

const cols = [
    { name: 'Search' },
    { name: 'Links' },
    { name: 'Time'},
];

const placeHolder = {
    'Search': 'Input Splunk Query',
    'Links': 'Connect to Attributes',
    'Time': '07/28/1016/',
}

const queryOptions = {
    'hosts':['staging*', 'labs*'],
    'level':['60', '50', '40'],
    'source': ["/var/log/graphistry-json/*.log"]
}

var query = `${Object.keys(queryOptions)
    .map((key) => {
        return '(' + key + '=' + queryOptions[key].join(' OR ') + ')'
    })
    .join(' ')
}`

const rows = Array.from({ length: 1 },
    function(x, index) {
        if (index == 0) {
            return createRow(cols, {
                'Search': `${query}   | spath output=dataset path="metadata.dataset" | search dataset="*" `,
                'Links': 'msg, dataset',
                'Time': '07/28/2016'
            })
        }
        else {
            return createRow(cols, placeHolder)
        }
    }
);

const app = createApp(rows);


const routeServices = {
    loadApp: loadApp(app),
    insertRow, spliceRow, calcTotals, searchPivot, uploadGraph,
    loadRowsById: loadRows(loadApp(app)),
    loadPivotsById: loadPivots(loadApp(app)),
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

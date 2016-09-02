import expressApp from './app.js'
import bodyParser from 'body-parser';

import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import { getDataSourceFactory } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

import { simpleflake } from 'simpleflakes';
import { app as createApp, row as createRow, investigation as createInvestigation } from '../shared/models';
import { loadApp, loadInvestigations, loadPivots, loadRows, insertPivot, splicePivot, calcTotals, searchPivot, uploadGraph } from '../shared/services';

import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from 'falcor-json-graph';
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

const pivots1 = Array.from({ length: 1 },
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

const pivots2 = Array.from({ length: 6 },
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
pivots1.name = 'default'

const app = createApp([pivots1, pivots2]);

const routeServices = {
    loadApp: loadApp(app),
    loadInvestigationsById: loadInvestigations(loadApp(app)),
    insertPivot, splicePivot, calcTotals, searchPivot, uploadGraph,
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

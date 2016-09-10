import expressApp from './app.js'
import bodyParser from 'body-parser';

import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import { getDataSourceFactory } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

import { simpleflake } from 'simpleflakes';
import { app as createApp, pivot as createPivot, investigation as createInvestigation } from '../shared/models';
import { loadApp, loadInvestigations, loadPivots, loadRows, insertPivot, splicePivot, calcTotals, searchPivot, uploadGraph } from '../shared/services';

import PivotTemplates from '../shared/models/PivotTemplates';

import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';
const cols = [
    { name: 'Mode'},
    { name: 'Input' },
    { name: 'Search' },
    { name: 'Links' },
    { name: 'Time'}
];

const placeHolder = {
    'Search': 'Input Splunk Query',
    'Links': 'Connect to Attributes',
    'Time': '07/28/1016/',
    'Mode': PivotTemplates.get('Search').name,
    'Input': 'Pivot 0'
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
            return createPivot(cols, {
                'Search': `${query}   | spath output=dataset path="metadata.dataset" | search dataset="*" `,
                'Links': 'msg, dataset',
                'Time': '07/28/2016',
                'Mode': PivotTemplates.get('Search').name,
                'Input': 'none'
            })
        }
        else {
            return createPivot(cols, placeHolder)
        }
    }
);

const pivots2 = Array.from({ length: 2 },
    function(x, index) {
        if (index == 0) {
            return createPivot(cols, {
                'Search': `malware`,
                'Links': 'dest_ip, misc',
                'Time': '07/28/2016',
                'Mode': PivotTemplates.get('Search').name,
                'Input': 'none'
            })
        }
        else {
            return createPivot(cols, placeHolder)
        }
    }
);


const pivots3 = [
    createPivot(cols, {
        'Search': 'BRO8ZA4A "Alert Category"="Fire Eye" index="alert_graph_demo"',
        'Links': '*',
        'Time': '',
        'Mode': PivotTemplates.get('Search').name,
        'Input': 'none'
    }),
    createPivot(cols, {
        'Search': '[{{pivot0}}] -[Message]-> [Fire Eye]',
        'Links': '*',
        'Time': '',
        'Mode': PivotTemplates.get('Expand with Fire Eye').name,
        'Input': 'Pivot 0'
    }),
    createPivot(cols, {
        'Search': '[{{pivot1}}] -[Fire Eye URL]-> [blue coat proxy]',
        'Links': '*',
        'Time': '',
        'Mode': PivotTemplates.get('Expand with Blue Coat').name,
        'Input': 'Pivot 1'
    }),
    createPivot(cols, {
        'Search': '[{{pivot2}}] -[External IPs]-> [Firewall]',
        'Links': '*',
        'Time': '',
        'Mode': PivotTemplates.get('Expand with Firewall').name,
        'Input': 'Pivot 2'
    })
];

pivots1.name = 'Dataset Errors';
pivots2.name = 'Malware';
pivots3.name = 'Botnet BRO8ZA4A';

const app = createApp([pivots3, pivots1, pivots2]);

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

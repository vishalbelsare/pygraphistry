import expressApp from './app.js'
import bodyParser from 'body-parser';

import { reloadHot } from '../shared/reloadHot';
import { renderMiddleware } from './middleware';
import { getDataSourceFactory } from '../shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

import { app as createApp, row as createRow } from '../shared/models';
import { loadApp, loadRows, insertRow, spliceRow, calcTotals, selectPivot } from '../shared/services';

const cols = [
    { name: 'Data source' },
    { name: 'Condition' },
    { name: 'Time'},
];

const values = [
    {
    'Data source': 'FireEye',
    'Condition': 'Really important events',
    'Time': 'Game Time',
    'url': 'http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/DP3S3MNXTY&type=vgraph&viztoken=a37dd223ad09bf9f238f7b88fea91782cb46d7f9&usertag=45d0e486-pygraphistry-0.9.30&info=true'
    },
    {
    'Data source': 'Proxy Logs',
    'Condition': 'Really important events',
    'Time': 'Game Time',
    'url': 'http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/W54T3R8M66&type=vgraph&viztoken=9b40d934c7c6034bc8a67f5bc9db53d984eaf18a&usertag=45d0e486-pygraphistry-0.9.30&info=true'
    },
    {
    'Data source': 'FireWall',
    'Condition': 'Really important events',
    'Time': 'Game Time',
    'url': 'http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/8BM4JAOY3W&type=vgraph&viztoken=5ef5166761d0b6ec6c49aa725afcbc9440f244b2&usertag=45d0e486-pygraphistry-0.9.30&info=true'
    },
    {
    'Data source': 'IDS',
    'Condition': 'Really important events',
    'Time': 'Game Time',
    'url': 'http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/M7AOEPKJUN&type=vgraph&viztoken=dd66d58fe5fdc4d5fcfc787e636cbcd846f4ae74&usertag=45d0e486-pygraphistry-0.9.30&info=true'
    },
    {
    'Data source': 'DHCP',
    'Condition': 'Really important events',
    'Time': 'Game Time',
    'url': 'http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/ZDTLKUH62K&type=vgraph&viztoken=6cd4aded18ca67ced6fc1bd4be4b3411d9a2d3cd&usertag=45d0e486-pygraphistry-0.9.30&info=true'
    },
    {
    'Data source': 'Endpoint Protection',
    'Condition': 'Really important events',
    'Time': 'Game Time',
    'url': 'http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/SM1AOZ551Z&type=vgraph&viztoken=efbc0f8efa58fb887359515c4a4be839bd97f837&usertag=45d0e486-pygraphistry-0.9.30&info=true'
    },
]

const rows = Array.from({ length: 6 }, (x, index) => (
    createRow(cols, values[index])
));

const app = createApp(cols, rows);


const routeServices = {
    loadApp: loadApp(app),
    insertRow, spliceRow, calcTotals, selectPivot,
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

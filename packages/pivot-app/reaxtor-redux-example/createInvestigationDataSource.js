import { getDataSourceFactory } from './common/middleware';

import { app as createApp, row as createRow } from './common/models';
import { loadApp, loadInvestigations, loadPivots, loadRows, insertPivot,
    splicePivot, calcTotals, searchPivot, uploadGraph } from './common/services';

export function getInvestigationDataSource() {

    const cols = [
        { name: 'Search' },
        { name: 'Links' },
        { name: 'Time'},
    ];

    const placeHolder = {
        'Search': 'Input Splunk Query',
        'Links': 'Connect to Attributes',
        'Time': '07/28/1016/',
    };

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
        loadInvestigationsById: loadInvestigations(loadApp(app)),
        insertPivot, splicePivot, calcTotals, searchPivot, uploadGraph,
        loadRowsById: loadRows(loadApp(app)),
        loadPivotsById: loadPivots(loadApp(app)),
    };

    const getDataSource = getDataSourceFactory(routeServices);
    return getDataSource;

}

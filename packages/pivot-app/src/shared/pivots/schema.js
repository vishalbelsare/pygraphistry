import VError from 'verror';
import { Observable } from 'rxjs';
import { withSchema } from '@graphistry/falcor-react-schema';
import { logErrorWithCode } from 'pivot-shared/util';
import { $pathValue } from '@graphistry/falcor-json-graph';

import logger from 'pivot-shared/logger.js';
const log = logger.createLogger(__filename);

export default withSchema((QL, { get, set }, services) => {

    const { loadPivotsById, loadTemplatesById } = services;
    const readOnlyHandler = {
        get: get(loadPivotsById)
    };
    const readWriteHandler = {
        get: get(loadPivotsById),
        set: set({
            unboxAtoms: false,
            service: loadPivotsById
        })
    };

    const paramHandler = {
        set: readWriteHandler.set,
        get: function (...args) {
            return get(loadPivotsById).apply(this, args)
                .mergeMap(({value,path}, i) => {
                    if (value === undefined) {                        
                        const field = path.slice(-1)[0];                        
                        const template = 
                            path.slice(0,-2)
                                .concat(['pivotTemplate', 'pivotParametersUI', field]);
                        return get(loadPivotsById).apply(this, [template])
                            //.map({value} => ({path, value}))
                            .mergeMap((v) => {

                                /*
                                { original: 
                                   [ 'pivotsById',
                                     '3f2fc63c1e995707',
                                     'pivotParameters',
                                     'manual-data$$$attributes' ],
                                  'redirecting to': 
                                   [ 'pivotsById',
                                     '3f2fc63c1e995707',
                                     'pivotTemplate',
                                     'pivotParametersUI',
                                     'manual-data$$$attributes' ],
                                  'got path': [ 'pivotsById', '3f2fc63c1e995707', 'pivotTemplate' ],
                                  'got value': { '$type': 'ref', value: [ 'templatesById', 'manual-data' ] } }
                                */
                                console.log('==== handling unknown param', field, {
                                    'original': path, 'redirecting to': template,
                                    'got path': v.path,
                                    'got value': v.value,
                                });

                                //----Trying to access the ref differently.. [ [ 'templatesById', 'manual-data' ] ]
                                console.log('----Trying to access the ref differently..', [v.value.value]);
                                return get(loadTemplatesById).apply(this, [v.value.value])
                                    .map((v) => {
                                        console.log('--- and got: ', v);
                                    });                         
                            });
                    } else {
                        return Observable.of(value);
                    }
                });
        }
    };
    

    const searchPivotHandler = {
        call: searchPivotCallRoute(services)
    };

    return QL`{
        ['id', 'length', 'resultCount', 'resultSummary']: ${
            readOnlyHandler
        },
        ['status', 'enabled', 'pivotTemplate']: ${
            readWriteHandler
        },
        pivotParameters: {
            [{ keys }]: ${
                paramHandler
            }
        },
        searchPivot: ${
            searchPivotHandler
        }
    }`;
});

function searchPivotCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot }) {
    return function(path, args) {
        const pivotIds = path[1];
        const investigationId = args[0];

        return searchPivot({ loadInvestigationsById, loadPivotsById, pivotIds, investigationId })
            .mergeMap(({ pivot }) => {
                return [
                    $pathValue(`pivotsById['${pivot.id}']['resultCount']`, pivot.resultCount),
                    $pathValue(`pivotsById['${pivot.id}']['resultSummary']`, pivot.resultSummary),
                    $pathValue(`pivotsById['${pivot.id}']['enabled']`, pivot.enabled),
                    $pathValue(`pivotsById['${pivot.id}']['status']`, pivot.status)
                ];
            })
            .catch(captureErrorAndNotifyClient(pivotIds))
    }
}

function captureErrorAndNotifyClient(pivotIds) {
    return function(e) {
        const errorCode = logErrorWithCode(log, e);
        const cause = VError.cause(e);
        const status = {
            ok: false,
            searching: false,
            code: errorCode,
            message: `${cause && cause.message || e.message} (code: ${errorCode})`,
            title: 'Error running pivot!'
        };

        return Observable.from([
            $pathValue(`pivotsById['${pivotIds}']['status']`, status)
        ]);
    }
}

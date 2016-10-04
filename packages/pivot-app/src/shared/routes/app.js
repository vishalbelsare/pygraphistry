import { Observable } from 'rxjs';
import {
    ref as $ref,
    pathValue as $pathValue,
    pathInvalidation as $invalidation,
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    setHandler,
    logErrorWithCode,
    rangesToListItems
} from './support';


export function app({ loadApp, createInvestigation }) {
    const appGetRoute = getHandler([], loadApp);
    const appSetRoute = setHandler([], loadApp);

    return [{
        returns: `*`,
        get: appGetRoute,
        route: `['title']`
    }, {
        get: appGetRoute,
        set: appSetRoute,
        returns: `$ref('investigationsById[{investigationId}])`,
        route: `selectedInvestigation`
    }, {
        route: `['pivots'][{ranges}]`,
        get: rangesToListItems({ loadApp }),
        returns: `$ref('pivotsById[{ pivotId }]')`
    }, {
        route: `createInvestigation`,
        call: createInvestigationCallRoute({ loadApp, createInvestigation })
    }];
}


function createInvestigationCallRoute({loadApp, createInvestigation}) {
    return function(path, args) {
        return Observable.defer(() => createInvestigation({loadApp}))
            .mergeMap(({app, numInvestigations}) => {
                return [
                    $pathValue(`['investigations'].length`, numInvestigations),
                    $pathValue(`selectedInvestigation`, app.selectedInvestigation),
                    $invalidation(`['investigations']['${numInvestigations - 1}']`)
                ];
            })
            .catch(logErrorWithCode);
    };
}

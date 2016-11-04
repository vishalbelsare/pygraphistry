import { Observable } from 'rxjs';
import {
    ref as $ref,
    pathValue as $pathValue,
    pathInvalidation as $invalidation,
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    logErrorWithCode,
    rangesToListItems
} from './support';


export function app({ loadApp, createInvestigation, loadUsersById }) {
    const appGetRoute = getHandler([], loadApp);

    return [{
        route: `['title']`,
        returns: `String`,
        get: appGetRoute,

    }, {
        route: `createInvestigation`,
        call: createInvestigationCallRoute({ loadApp, loadUsersById, createInvestigation })
    }];
}


function createInvestigationCallRoute({loadApp, createInvestigation, loadUsersById}) {
    return function(path, args) {
        return Observable.defer(() => createInvestigation({loadApp, loadUsersById}))
            .mergeMap(({app, user, numInvestigations}) => {
                return [
                    $pathValue(`['usersById'][${user.id}]['investigations'].length`, numInvestigations),
                    $pathValue(`['usersById'][${user.id}].activeInvestigation`, user.activeInvestigation),
                    $invalidation(`['usersById'][${user.id}]['investigations']['${numInvestigations - 1}']`)
                ];
            })
            .catch(logErrorWithCode);
    };
}

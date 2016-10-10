import { Observable } from 'rxjs';
import _ from 'underscore';
import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    setHandler,
    logErrorWithCode,
    mapObjectsToAtoms
} from './support';

export function users({ loadApp, loadUsersById }) {
    const appGetRoute = getHandler([], loadApp);

    return [{
        route: `currentUser`,
        get: appGetRoute,
        returns: `$ref('usersById[{userId}]'`
    }, {
        route: `['usersById'][{keys}]['activeScreen']`,
        get: getHandler(['user'], loadUsersById),
        set: setHandler(['user'], loadUsersById),
        returns: `String`,
    }, {
        returns: `String`,
        route: `['usersById'][{keys}]['name','id']`,
        get: getHandler(['user'], loadUsersById)
    }, {
        returns: `Number`,
        route: `['usersById'][{keys}]['investigations'].length`,
        get: getHandler(['user'], loadUsersById)
    }, {
        route: `['usersById'][{keys}]['investigations'][{keys}]`,
        get: getHandler(['user'], loadUsersById),
        returns: `$ref('investigationsById[{investigationId}]')`
    }, {
        route: `['usersById'][{keys}]['deleteInvestigations']`,
        call: deleteInvestigationsCallRoute({loadUsersById})
    }];
}

function deleteInvestigationsCallRoute({loadUsersById}) {
    return function (path, args) {
        const userIds = path[1];
        const investigationIds = args[0];
        return Observable.defer(() => loadUsersById({userIds: userIds}))
            .mergeMap(({user, app}) => {
                const newInvestigations = _.reject(user.investigations, i =>
                    investigationIds.includes(i.value[1])
                );
                const oldLength = user.investigations.length;
                user.investigations = newInvestigations;

                const selectedInvestigationId = app.selectedInvestigation !== undefined ?
                                                app.selectedInvestigation.value[1] :
                                                undefined;
                if (investigationIds.includes(selectedInvestigationId)) {
                    app.selectedInvestigation  = newInvestigations.length > 0 ? user.investigations[0]
                                                                              : undefined;
                }

                return [
                    $pathValue(`['usersById'][${user.id}]['investigations']['length']`, newInvestigations.length),
                    $invalidation(`['usersById'][${user.id}]['investigations'][${0}..${oldLength}]`),
                    $invalidation(`['selectedInvestigation']`)
                ];
            })
            .catch(logErrorWithCode)
    };
}

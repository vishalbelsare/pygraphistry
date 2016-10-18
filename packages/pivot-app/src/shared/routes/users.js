import { Observable } from 'rxjs';
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

export function users({ loadApp, removeInvestigationsById, loadUsersById, deleteInvestigationsById,
                        deletePivotsById}) {
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
        route: `['usersById'][{keys}]['activeInvestigation']`,
        get: getHandler(['user'], loadUsersById),
        set: setHandler(['user'], loadUsersById),
        returns: `$ref('investigationsById[{investigationId}]`,
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
        call: deleteInvestigationsCallRoute({ removeInvestigationsById, loadUsersById,
                                             deleteInvestigationsById, deletePivotsById })
    }];
}

function deleteInvestigationsCallRoute({ removeInvestigationsById, loadUsersById,
                                         deleteInvestigationsById, deletePivotsById }) {
    return function (path, args) {
        const userIds = path[1];
        const investigationIds = args[0];

        return Observable.defer(() =>
                removeInvestigationsById({ loadUsersById, deleteInvestigationsById, deletePivotsById,
                                           investigationIds, userIds })
            )
            .map(({user, newLength, oldLength}) => [
                $pathValue(`['usersById'][${user.id}]['investigations']['length']`, newLength),
                $invalidation(`['usersById'][${user.id}]['investigations'][${0}..${oldLength}]`),
                $invalidation(`['usersById'][${user.id}]['activeInvestigation']`)
            ])
            .catch(logErrorWithCode);
    }
}

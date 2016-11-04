import { Observable } from 'rxjs';
import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    setHandler,
    logErrorWithCode,
} from './support';

export function users({ loadApp, removeInvestigationsById, loadUsersById, deleteInvestigationsById,
                        deletePivotsById}) {
    const appGetRoute = getHandler([], loadApp);
    const getUserHandler = getHandler(['user'], loadUsersById);
    const setUserHandler = setHandler(['user'], loadUsersById);

    return [{
        route: `currentUser`,
        returns: `$ref('usersById[{userId}]')`,
        get: appGetRoute,
    }, {
        route: `['usersById'][{keys}]['activeScreen']`,
        returns: `String`,
        get: getUserHandler,
        set: setUserHandler,

    }, {
        route: `['usersById'][{keys}]['activeInvestigation']`,
        returns: `$ref('investigationsById[{investigationId}]')`,
        get: getUserHandler,
        set: setUserHandler,
    }, {
        route: `['usersById'][{keys}]['name','id']`,
        returns: `String`,
        get: getUserHandler,
    }, {
        route: `['usersById'][{keys}]['investigations', 'templates'].length`,
        returns: `Number`,
        get: getUserHandler,
    }, {
        route: `['usersById'][{keys}]['investigations'][{keys}]`,
        returns: `$ref('investigationsById[{investigationId}]')`,
        get: getUserHandler,
    }, {
        route: `['usersById'][{keys}]['templates'][{keys}]`,
        returns: `$ref('templatesById[{templateId}]')`,
        get: getUserHandler,
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

        return removeInvestigationsById({ loadUsersById, deleteInvestigationsById, deletePivotsById,
                                          investigationIds, userIds })
            .map(({user, newLength, oldLength}) => [
                $pathValue(`['usersById'][${user.id}]['investigations']['length']`, newLength),
                $invalidation(`['usersById'][${user.id}]['investigations'][${0}..${oldLength}]`),
                $invalidation(`['usersById'][${user.id}]['activeInvestigation']`)
            ]);
    }
}

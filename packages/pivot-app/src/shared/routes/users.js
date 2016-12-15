import { Observable } from 'rxjs';
import _ from 'underscore';
import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    setHandler,
} from './support';

import logger from '../logger.js';
const log = logger.createLogger('pivot-app', __filename);


export function users(services) {
    const appGetRoute = getHandler([], services.loadApp);
    const getUserHandler = getHandler(['user'], services.loadUsersById);
    const setUserHandler = setHandler(['user'], services.loadUsersById);

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
        set: setActiveInvestigationRoute({ ...services, setUserHandler }),
    }, {
        route: `['usersById'][{keys}]['name','id']`,
        returns: `String`,
        get: getUserHandler,
    }, {
        route: `['usersById'][{keys}]['investigations', 'templates', 'connectors'].length`,
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
        route: `['usersById'][{keys}]['connectors'][{keys}]`,
        returns: `$ref('connectorsById[{connectorId}]')`,
        get: getUserHandler
    }, {
        get: getUserHandler,
        route: `['usersById'][{keys}].createInvestigation`,
        call: createInvestigationCallRoute(services)
    }, {
        route: `['usersById'][{keys}]['removeInvestigations']`,
        call: removeInvestigationsCallRoute(services)
    }];
}

function setActiveInvestigationRoute({ loadUsersById, loadInvestigationsById,
                                       unloadInvestigationsById, unloadPivotsById,
                                       switchActiveInvestigation, setUserHandler }) {
    return function (path, args) {
        const userIds = path[1];
        const self = this;

        return Observable.forkJoin(
                _.map(path.usersById, (user, userId) =>
                    switchActiveInvestigation({ loadUsersById, loadInvestigationsById,
                                                unloadInvestigationsById, unloadPivotsById,
                                                userId })
                )
            )
            .switchMap(() => setUserHandler.bind(self)(path, args));
    }
}

function removeInvestigationsCallRoute({ removeInvestigationsById, loadUsersById,
                                         unlinkInvestigationsById, unlinkPivotsById }) {
    return function (path, args) {
        const userIds = path[1];
        const investigationIds = args[0];

        return removeInvestigationsById({ loadUsersById, unlinkInvestigationsById, unlinkPivotsById,
                                          investigationIds, userIds })
            .mergeMap(({user, newLength, oldLength}) => [
                $pathValue(`['usersById'][${user.id}]['investigations']['length']`, newLength),
                $invalidation(`['usersById'][${user.id}]['investigations'][${0}..${oldLength}]`),
                $invalidation(`['usersById'][${user.id}]['activeInvestigation']`)
            ]);
    }
}


function createInvestigationCallRoute({ createInvestigation, loadUsersById }) {
    return function(path, args) {
        const userIds = path[1];

        return createInvestigation({ loadUsersById, userIds })
            .mergeMap(({app, user, numInvestigations}) => {
                return [
                    $pathValue(`['usersById'][${user.id}]['investigations'].length`, numInvestigations),
                    $pathValue(`['usersById'][${user.id}].activeInvestigation`, user.activeInvestigation),
                    $invalidation(`['usersById'][${user.id}]['investigations']['${numInvestigations - 1}']`)
                ];
            });
    };
}

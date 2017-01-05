import _ from 'underscore';
import { Observable } from 'rxjs';
import { withSchema } from '@graphistry/falcor-react-schema';
import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';
import logger from 'pivot-shared/logger.js';
const log = logger.createLogger(__filename);

export default withSchema((QL, { get, set }, services) => {

    const { loadUsersById } = services;

    const readOnlyHandler = {
        get: get(loadUsersById)
    };
    const readWriteHandler = {
        get: get(loadUsersById),
        set: set({
            unboxAtoms: false,
            service: loadUsersById
        })
    };

    const activeInvestigationReadWriteHandler = {
        get: get(loadUsersById),
        set: setActiveInvestigationRoute({
            ...services,
            setUserHandler: set({
                unboxAtoms: false,
                service: loadUsersById
            })
        })
    };

    const createInvestigationHandler = {
        call: createInvestigationCallRoute(services)
    };

    const removeInvestigationsHandler = {
        call: removeInvestigationsCallRoute(services)
    };

    return QL`{
        ['id', 'name']: ${
            readOnlyHandler
        },
        activeScreen: ${
            readWriteHandler
        },
        activeInvestigation: ${
            activeInvestigationReadWriteHandler
        },
        ['investigations', 'templates', 'connectors']: {
            [{ keys }]: ${
                readOnlyHandler
            }
        },
        createInvestigation: ${
            createInvestigationHandler
        },
        removeInvestigations: ${
            removeInvestigationsHandler
        }
    }`
});

function setActiveInvestigationRoute({ loadUsersById, loadInvestigationsById,
                                       unloadInvestigationsById, unloadPivotsById,
                                       switchActiveInvestigation, setUserHandler }) {
    return function (json) {
        const self = this;

        return Observable.forkJoin(
                _.map(json.usersById, (user, userId) =>
                    switchActiveInvestigation({ loadUsersById, loadInvestigationsById,
                                                unloadInvestigationsById, unloadPivotsById,
                                                userId })
                )
            )
            .switchMap(() => setUserHandler.bind(self)(json));
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

function createInvestigationCallRoute({ createInvestigation, loadUsersById,
                                        loadInvestigationsById, unloadInvestigationsById,
                                        unloadPivotsById }) {
    return function(path) {
        const userIds = path[1];

        return createInvestigation({ loadUsersById, loadInvestigationsById,
                                     unloadInvestigationsById, unloadPivotsById, userIds })
            .mergeMap(({ user, numInvestigations }) => {
                return [
                    $pathValue(`['usersById'][${user.id}]['investigations'].length`, numInvestigations),
                    $pathValue(`['usersById'][${user.id}].activeInvestigation`, user.activeInvestigation),
                    $invalidation(`['usersById'][${user.id}]['investigations']['${numInvestigations - 1}']`)
                ];
            });
    };
}

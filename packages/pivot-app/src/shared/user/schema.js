import _ from 'underscore';
import { Observable } from 'rxjs';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $value, $invalidation } from '@graphistry/falcor-json-graph';
import logger from 'pivot-shared/logger';
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

    const cloneInvestigationsHandler = { call: cloneInvestigationsCallRoute(services) };
    const createInvestigationHandler = { call: createInvestigationCallRoute(services) };
    const removeInvestigationsHandler = { call: removeInvestigationsCallRoute(services) };

    return QL`{
        ['id', 'name', 'graphistryHost']: ${readOnlyHandler},
        activeScreen: ${readWriteHandler},
        activeInvestigation: ${activeInvestigationReadWriteHandler},
        ['investigations', 'templates', 'connectors']: {
            [{ keys }]: ${readOnlyHandler}
        },
        cloneInvestigations: ${cloneInvestigationsHandler},
        createInvestigation: ${createInvestigationHandler},
        removeInvestigations: ${removeInvestigationsHandler}
    }`;
});

function setActiveInvestigationRoute({
    loadUsersById,
    loadInvestigationsById,
    unloadInvestigationsById,
    unloadPivotsById,
    switchActiveInvestigation,
    setUserHandler
}) {
    return function(json) {
        const self = this;

        return Observable.forkJoin(
            _.map(json.usersById, (user, userId) =>
                switchActiveInvestigation({
                    loadUsersById,
                    loadInvestigationsById,
                    unloadInvestigationsById,
                    unloadPivotsById,
                    userId
                })
            )
        ).switchMap(() => setUserHandler.bind(self)(json));
    };
}

function removeInvestigationsCallRoute({
    removeInvestigationsById,
    loadUsersById,
    unlinkInvestigationsById,
    unlinkPivotsById
}) {
    return function(path, args) {
        const userIds = path[1];
        const investigationIds = args[0];

        return removeInvestigationsById({
            loadUsersById,
            unlinkInvestigationsById,
            unlinkPivotsById,
            investigationIds,
            userIds
        }).mergeMap(({ user, investigation, newLength, oldLength }) => [
            $invalidation(`investigationsById['${investigation.id}']`),
            $invalidation(`usersById['${user.id}'].activeInvestigation`),
            $invalidation(`usersById['${user.id}'].investigations[${newLength}..${oldLength}]`),

            $value(`usersById['${user.id}'].investigations.length`, newLength),
            $value(`usersById['${user.id}'].activeInvestigation`, user.activeInvestigation),

            ...user.investigations.map((investigationRef, index) =>
                $value(`usersById['${user.id}'].investigations[${index}]`, investigationRef)
            )
        ]);
    };
}

function cloneInvestigationsCallRoute({
    loadInvestigationsById,
    loadPivotsById,
    loadUsersById,
    unloadInvestigationsById,
    unloadPivotsById,
    cloneInvestigationsById
}) {
    return function(path, investigationIds = []) {
        return cloneInvestigationsById({
            loadInvestigationsById,
            loadPivotsById,
            unloadInvestigationsById,
            unloadPivotsById,
            loadUsersById,
            investigationIds
        }).mergeMap(({ user, clonedInvestigation, numInvestigations }) => [
            $value(`usersById['${user.id}'].investigations.length`, numInvestigations),
            $value(`usersById['${user.id}'].activeInvestigation`, user.activeInvestigation),
            $value(
                `usersById['${user.id}'].investigations[${numInvestigations - 1}]`,
                $ref(`investigationsById['${clonedInvestigation.id}']`)
            )
        ]);
    };
}

function createInvestigationCallRoute({
    createInvestigation,
    loadUsersById,
    loadInvestigationsById,
    unloadInvestigationsById,
    unloadPivotsById
}) {
    return function(path) {
        const userIds = path[1];

        return createInvestigation({
            loadUsersById,
            loadInvestigationsById,
            unloadInvestigationsById,
            unloadPivotsById,
            userIds
        }).mergeMap(({ user, newInvestigation, numInvestigations }) => [
            $value(`usersById['${user.id}'].investigations.length`, numInvestigations),
            $value(`usersById['${user.id}'].activeInvestigation`, user.activeInvestigation),
            $value(
                `usersById['${user.id}'].investigations[${numInvestigations - 1}]`,
                $ref(`investigationsById['${newInvestigation.id}']`)
            )
        ]);
    };
}

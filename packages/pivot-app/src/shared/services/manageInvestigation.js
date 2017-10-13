import { Observable } from 'rxjs';
import _ from 'underscore';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import {
    createInvestigationModel,
    createPivotModel,
    cloneInvestigationModel,
    clonePivotModel
} from '../models';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

function insertInvestigation(app, user, newInvestigation) {
    app.investigationsById[newInvestigation.id] = newInvestigation;
    const newRef = $ref(`investigationsById['${newInvestigation.id}']`);
    user.investigations.push(newRef);

    return { newRef, numInvestigations: user.investigations.length };
}

function insertPivots(app, pivots) {
    pivots.forEach(pivot => {
        app.pivotsById[pivot.id] = pivot;
    });
}

function getActiveInvestigationId(user) {
    return user.activeInvestigation !== undefined ? user.activeInvestigation.value[1] : undefined;
}

export function createInvestigation({
    loadUsersById,
    loadInvestigationsById,
    unloadInvestigationsById,
    unloadPivotsById,
    userIds
}) {
    return loadUsersById({ userIds })
        .mergeMap(({ app, user }) => {
            const pivot0 = createPivotModel({});
            const newInvestigation = createInvestigationModel(
                { pivots: [pivot0.id] },
                user.investigations.length
            );
            insertPivots(app, [pivot0]);
            const { newRef, numInvestigations } = insertInvestigation(app, user, newInvestigation);

            return switchActiveInvestigation({
                loadUsersById,
                loadInvestigationsById,
                unloadInvestigationsById,
                unloadPivotsById,
                userId: user.id
            })
                .do(() => {
                    user.activeInvestigation = newRef;
                })
                .map(() => ({ app, user, newInvestigation, numInvestigations }));
        })
        .do(({ newInvestigation }) =>
            log.debug(`Created new investigation ${newInvestigation.id}`)
        );
}

export function switchActiveInvestigation({
    loadUsersById,
    loadInvestigationsById,
    unloadInvestigationsById,
    unloadPivotsById,
    userId
}) {
    return loadUsersById({ userIds: [userId] }).mergeMap(({ user }) => {
        const activeId = getActiveInvestigationId(user);

        if (activeId === undefined) {
            return Observable.of(null);
        }
        return closeInvestigationsById({
            loadInvestigationsById,
            unloadInvestigationsById,
            unloadPivotsById,
            investigationIds: [activeId]
        });
    });
}

/* DISABLED UNTIL WE HAVE AUTOSAVE. MAY CAUSES DATA LOSS UNEXPECTED BY USER
 *
function closeInvestigationsById({ loadInvestigationsById, unloadInvestigationsById,
                                   unloadPivotsById, investigationIds }) {
    return loadInvestigationsById({investigationIds})
        .mergeMap(({ investigation }) => {
            const pivotIds = investigation.pivots.map(x => x.value[1]);

            return unloadPivotsById({pivotIds})
                .defaultIfEmpty(null);
        })
        .toArray()
        .switchMap(() =>
            unloadInvestigationsById({investigationIds})
        )
        .do(({investigation}) =>
            log.info(`Closed investigation ${investigation.id}`)
        )
        .defaultIfEmpty(null);
}*/
function closeInvestigationsById() {
    return Observable.of(null);
}

export function cloneInvestigationsById({
    loadInvestigationsById,
    loadPivotsById,
    loadUsersById,
    unloadInvestigationsById,
    unloadPivotsById,
    investigationIds
}) {
    return loadInvestigationsById({ investigationIds })
        .mergeMap(({ app, investigation }) =>
            Observable.combineLatest(
                loadPivotsById({ pivotIds: investigation.pivots.map(x => x.value[1]) })
                    .map(({ pivot }) => clonePivotModel(pivot))
                    .toArray(),
                loadUsersById({ userIds: [app.currentUser.value[1]] }),
                (clonedPivots, { user }) => ({ clonedPivots, user })
            ).mergeMap(({ clonedPivots, user }) => {
                insertPivots(app, clonedPivots);
                const clonedInvestigation = cloneInvestigationModel(investigation, clonedPivots);
                const { newRef, numInvestigations } = insertInvestigation(
                    app,
                    user,
                    clonedInvestigation
                );

                return switchActiveInvestigation({
                    loadUsersById,
                    loadInvestigationsById,
                    unloadInvestigationsById,
                    unloadPivotsById,
                    userId: user.id
                })
                    .do(() => {
                        user.activeInvestigation = newRef;
                    })
                    .map(() => ({
                        app,
                        user,
                        clonedInvestigation,
                        originalInvestigation: investigation,
                        numInvestigations
                    }));
            })
        )
        .do(({ originalInvestigation, clonedInvestigation }) =>
            log.debug(
                `Cloned investigation ${originalInvestigation.id} to ${clonedInvestigation.id}`
            )
        );
}

export function saveInvestigationsById({
    loadInvestigationsById,
    persistInvestigationsById,
    persistPivotsById,
    unlinkPivotsById,
    investigationIds
}) {
    return loadInvestigationsById({ investigationIds })
        .mergeMap(({ app, investigation }) => {
            investigation.modifiedOn = Date.now();
            const pivotIds = investigation.pivots.map(x => x.value[1]);

            return persistPivotsById({ pivotIds })
                .toArray()
                .switchMap(() =>
                    unlinkPivotsById({ pivotIds: investigation.detachedPivots }).toArray()
                )
                .switchMap(() =>
                    persistInvestigationsById({ investigationIds: [investigation.id] })
                )
                .map(() => ({ app, investigation }));
        })
        .do(({ investigation }) => log.debug(`Saved investigation ${investigation.id}`));
}

export function removeInvestigationsById({
    loadUsersById,
    unlinkInvestigationsById,
    unlinkPivotsById,
    investigationIds,
    userIds
}) {
    return loadUsersById({ userIds: userIds }).mergeMap(({ user }) => {
        const newInvestigations = _.reject(user.investigations, i =>
            investigationIds.includes(i.value[1])
        );
        const oldLength = user.investigations.length;
        user.investigations = newInvestigations;

        const activeInvestigationId = getActiveInvestigationId(user);
        if (investigationIds.includes(activeInvestigationId)) {
            user.activeInvestigation =
                newInvestigations.length > 0 ? user.investigations[0] : undefined;
        }

        return unlinkInvestigationsById({ investigationIds })
            .mergeMap(
                ({ investigation }) => {
                    const pivotIds = investigation.pivots.map(x => x.value[1]);

                    return unlinkPivotsById({ pivotIds }).toArray();
                },
                ({ app, investigation }) => ({
                    app,
                    user,
                    investigation,
                    oldLength,
                    newLength: newInvestigations.length
                })
            )
            .do(({ investigation }) => log.debug(`Removed investigation ${investigation.id}`));
    });
}

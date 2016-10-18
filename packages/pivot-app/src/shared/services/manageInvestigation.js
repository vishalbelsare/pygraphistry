import { Observable } from 'rxjs';
import _ from 'underscore';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import {
    createInvestigationModel,
    createPivotModel,
    cloneInvestigationModel,
    clonePivotModel
} from '../models';


function insertAndSelectInvestigation(app, user, newInvestigation) {
    app.investigationsById[newInvestigation.id] = newInvestigation;
    const newRef = $ref(`investigationsById['${newInvestigation.id}']`);
    user.investigations.push(newRef);
    user.activeInvestigation = newRef;

    return user.investigations.length;
}

function insertPivots(app, pivots) {
    pivots.forEach(pivot => {
        app.pivotsById[pivot.id] = pivot;
    });
}

function getActiveInvestigationId(user) {
    return user.activeInvestigation !== undefined ? user.activeInvestigation.value[1]
                                                  : undefined;
}

export function createInvestigation({ loadApp, loadUsersById }) {
    return loadApp()
        .switchMap(app =>
            loadUsersById({userIds: [app.currentUser.value[1]]})
        )
        .map(({app, user}) => {
            const pivot0 = createPivotModel({});
            const newInvestigation = createInvestigationModel({pivots: [pivot0.id]}, user.investigations.length);
            insertPivots(app, [pivot0]);
            const numInvestigations = insertAndSelectInvestigation(app, user, newInvestigation);

            return ({app, user, newInvestigation, numInvestigations});
        });
}

export function cloneInvestigationsById({ loadInvestigationsById, loadPivotsById, loadUsersById, investigationIds }) {
    return loadInvestigationsById({investigationIds})
        .mergeMap(({app, investigation}) =>
            Observable.combineLatest(
                loadPivotsById({pivotIds: investigation.pivots.map(x => x.value[1])})
                    .map(({pivot}) => clonePivotModel(pivot))
                    .toArray(),
                loadUsersById({userIds: [app.currentUser.value[1]]}),
                (clonedPivots, {user}) => ({clonedPivots, user})
            )
            .map(({clonedPivots, user}) => {
                insertPivots(app, clonedPivots);
                const clonedInvestigation = cloneInvestigationModel(investigation, clonedPivots);
                const numInvestigations = insertAndSelectInvestigation(app, user, clonedInvestigation);

                return ({app, user, clonedInvestigation, numInvestigations});
            })
        )
}

export function removeInvestigationsById({loadUsersById, deleteInvestigationsById, deletePivotsById,
                                          investigationIds, userIds}) {
    return loadUsersById({userIds: userIds})
        .mergeMap(({user, app}) => {
            const newInvestigations = _.reject(user.investigations, i =>
                investigationIds.includes(i.value[1])
            );
            const oldLength = user.investigations.length;
            user.investigations = newInvestigations;

            const activeInvestigationId = getActiveInvestigationId(user);
            if (investigationIds.includes(activeInvestigationId)) {
                user.activeInvestigation  = newInvestigations.length > 0 ?
                                            user.investigations[0] :
                                            undefined;
            }

            return deleteInvestigationsById({investigationIds, deletePivotsById})
                .map(({app,  investigation}) => ({
                    app, user, investigation, oldLength,
                    newLength: newInvestigations.legnth
                }));
        });
}

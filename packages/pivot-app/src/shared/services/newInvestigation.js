import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import {
    createInvestigationModel,
    createPivotModel,
    cloneInvestigationModel,
    clonePivotModel
} from '../models';

function insertAndSelectInvestigation(app, newInvestigation) {
    app.investigationsById[newInvestigation.id] = newInvestigation;
    app.investigations.push(newInvestigation);
    app.selectedInvestigation = $ref(`investigationsById['${newInvestigation.id}']`);

    return app.investigations.length;
}

function insertPivots(app, pivots) {
    pivots.forEach(pivot => {
        app.pivotsById[pivot.id] = pivot;
    });
}

export function createInvestigation({ loadApp }) {
    return loadApp()
        .map(app => {
            const pivot0 = createPivotModel({});
            const newInvestigation = createInvestigationModel({pivots: [pivot0.id]}, app.investigations.length);
            insertPivots(app, [pivot0]);
            const numInvestigations = insertAndSelectInvestigation(app, newInvestigation);

            return ({app, newInvestigation, numInvestigations});
        });
}

export function cloneInvestigationsById({ loadInvestigationsById, loadPivotsById, investigationIds }) {
    return loadInvestigationsById({investigationIds})
        .mergeMap(({app, investigation}) =>
            loadPivotsById({pivotIds: investigation.pivots.map(x => x.value[1])})
                .map(({pivot}) => clonePivotModel(pivot))
                .toArray()
                .map(clonedPivots => {
                    insertPivots(app, clonedPivots);
                    const clonedInvestigation = cloneInvestigationModel(investigation, clonedPivots);
                    const numInvestigations = insertAndSelectInvestigation(app, clonedInvestigation);

                    return ({app, clonedInvestigation, numInvestigations});
                })
        )
}

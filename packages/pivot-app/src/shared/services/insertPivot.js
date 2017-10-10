import { ref as $ref } from '@graphistry/falcor-json-graph';
import { createPivotModel } from '../models';

export function insertPivot({ loadInvestigationsById, investigationIds, pivotIndex }) {
  return loadInvestigationsById({ investigationIds }).map(({ app, investigation }) => {
    const pivot = createPivotModel({});
    app.pivotsById[pivot.id] = pivot;

    const insertedIndex = pivotIndex + 1;
    investigation.pivots.splice(insertedIndex, 0, $ref(`pivotsById['${pivot.id}']`));

    return { app, pivot, investigation, insertedIndex };
  });
}

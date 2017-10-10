import _ from 'underscore';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

export function splicePivot({
  loadInvestigationsById,
  unloadPivotsById,
  investigationIds,
  pivotIndex,
  deleteCount
}) {
  return loadInvestigationsById({ investigationIds })
    .mergeMap(({ app, investigation }) => {
      const deletedRefs = investigation.pivots.splice(pivotIndex, deleteCount);
      const deletedIds = deletedRefs.map(ref => ref.value[1]);

      investigation.detachedPivots = investigation.detachedPivots.concat(deletedIds);

      return unloadPivotsById({ pivotIds: deletedIds })
        .toArray()
        .map(() => ({ app, investigation }));
    })
    .do(({ investigation }) => {
      const deletedIndices = _.range(pivotIndex, pivotIndex + deleteCount);
      log.debug(`Spliced pivots ${deletedIndices} in ${investigation.id}`);
    });
}

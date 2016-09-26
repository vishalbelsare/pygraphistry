import { Observable } from 'rxjs';

export function splicePivot({loadInvestigationsById, investigationIds, pivotIndex, deleteCount}) {
    return loadInvestigationsById({investigationIds})
        .mergeMap(({app, investigation}) => {
            investigation.pivots.splice(pivotIndex, deleteCount);
            return Observable.of({app, investigation});
        });
}

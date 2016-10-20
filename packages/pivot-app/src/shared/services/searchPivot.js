import { Observable } from 'rxjs';
import PivotTemplates from '../models/pivotTemplates';
import _ from 'underscore';

export function searchPivot({ loadPivotsById, pivotIds }) {
    return loadPivotsById({ pivotIds: pivotIds })
        .mergeMap(({app, pivot}) => {

            const template = PivotTemplates.get('all', pivot.pivotParameters.mode);

            return template.searchAndShape({app, pivot})
                .catch(e => {
                    console.error(e);
                    pivot.status = {
                        ok: false,
                        message: e.message || 'Unknown Error'
                    };
                    return Observable.of({app, pivot});
                });
        });
}

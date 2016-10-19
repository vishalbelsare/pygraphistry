import { Observable } from 'rxjs';
import PivotTemplates from '../models/PivotTemplates';
import _ from 'underscore';

export function searchPivot({ loadPivotsById, pivotIds }) {
    return loadPivotsById({ pivotIds: pivotIds })
        .mergeMap(({app, pivot}) => {
            pivot.status = {
                ok: false,
                message: 'Searching...'
            }
            pivot.enabled = true;
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

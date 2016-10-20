import { Observable } from 'rxjs';
import { listTemplates } from '.';
import _ from 'underscore';


const templatesMap = listTemplates();

export function searchPivot({ loadPivotsById, pivotIds }) {
    return loadPivotsById({ pivotIds: pivotIds })
        .mergeMap(({app, pivot}) => {
            const template = templatesMap[pivot.pivotTemplate.value[1]];

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

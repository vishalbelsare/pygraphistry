import { Observable } from 'rxjs';
import { listTemplates } from '.';
import _ from 'underscore';
import logger from '../logger.js';
import VError from 'verror';

const log = logger.createLogger('pivot-app', __filename);

const templatesMap = listTemplates();
const pivotCache = {};

export function searchPivot({ loadPivotsById, pivotIds }) {
    return loadPivotsById({ pivotIds: pivotIds })
        .mergeMap(({app, pivot}) => {
            const template = templatesMap[pivot.pivotTemplate.value[1]];

            return template.searchAndShape({app, pivot, pivotCache})
                .do(({pivot}) => {
                    pivot.status = {ok: true, searching: false};
                })
                .catch((e) =>
                    Observable.throw(
                        new VError.WError({
                            name:'Failed search',
                            cause:e,
                        }, 'Search failed for pivot: "%s"', pivot.id)
                    )
                );
        });
}

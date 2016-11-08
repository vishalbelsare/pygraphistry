import { Observable } from 'rxjs';
import { listTemplates } from '.';
import _ from 'underscore';
import logger from '@graphistry/common/logger2.js';
const log = logger.createLogger('pivot-app', __filename);

const templatesMap = listTemplates();

export function searchPivot({ loadPivotsById, pivotIds }) {
    return loadPivotsById({ pivotIds: pivotIds })
        .mergeMap(({app, pivot}) => {
            const template = templatesMap[pivot.pivotTemplate.value[1]];

            return template.searchAndShape({app, pivot})
                .do(({pivot}) => {
                    pivot.status = {ok: true};
                })
                .map(() => ({app, pivot}))
                .catch(e => {
                    log.error(e, 'searchPivot error');
                    pivot.status = {
                        ok: false,
                        message: e.message || 'Unknown Error'
                    };
                    return Observable.of({app, pivot});
                });
        });
}

import { Observable } from 'rxjs';
import { listTemplates } from '.';
import _ from 'underscore';
import logger from '../logger.js';
import VError from 'verror';

const log = logger.createLogger(__filename);

const templatesMap = listTemplates();


function loadPivotsWithDefaults ({ loadPivotsById, loadTemplatesById }, { pivotIds }) {
    return loadPivotsById.call(this, { pivotIds })
                .mergeMap(
                    ({ pivot }) => loadTemplatesById({
                        templateIds: [pivot.pivotTemplate.value[1]]
                    }),
                    ({ pivot }, { template }) => ({ pivot, template }))
                .map(({pivot: {pivotParameters, ...pivot}, template}) => {
                    return {
                        pivot: {
                            ...pivot, 
                            pivotParameters:  {
                                ...Object.entries(template.pivotParametersUI.value)
                                    .reduce((result, [key, value]) => {
                                        result[key] = value.defaultValue;
                                        return result
                                    }, {}),
                                ...pivotParameters
                            }
                        }
                    };
                });
}


export function searchPivot({ loadPivotsById, loadTemplatesById, pivotIds, loadInvestigationsById, investigationId }) {
    return loadPivotsWithDefaults ({ loadPivotsById, loadTemplatesById }, { pivotIds })
        .mergeMap(({app, pivot}) => {

            const template = templatesMap[pivot.pivotTemplate.value[1]];

            return loadInvestigationsById({investigationIds: ([investigationId])}).flatMap(({investigation}) => {

                // Load other pivots in investigation
                const pivotIds = investigation.pivots.map(({value}) => value[1]);
                const context = 
                    //loadPivotsById({ pivotIds })
                    loadPivotsWithDefaults ({ loadPivotsById, loadTemplatesById }, { pivotIds })
                    .map(({ pivot }) => {
                        return pivot;
                    }).toArray();

                return context.flatMap((pivots) => {

                    const pivotCache = pivots.reduce((result, pivot) => {
                        result[pivot.id] = pivot;
                        return result;
                    }, {});

                    return template.searchAndShape({app, pivot, pivotCache})
                        .do(({pivot}) => {
                            pivot.status = {ok: true, searching: false};
                            if (pivot.isPartial) {
                                _.extend(pivot.status, {
                                    info: true,
                                    title: 'Results are not exhaustive!',
                                    message: 'The search hit the maximum time allowed. Showing only the most recent events found.'
                                });
                            }

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
            });
        });
}

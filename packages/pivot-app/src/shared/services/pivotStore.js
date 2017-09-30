import { SimpleFileSystemStore } from './support';
import {
    createPivotModel,
    serializePivotModel
} from '../models';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);


export function pivotStore(loadApp, pathPrefix, loadTemplatesById, pivotsByIdCache = {}) {
    const store = new SimpleFileSystemStore({
        loadApp,
        pathPrefix,
        entityName: 'pivot',
        createModel: createPivotModel,
        serializeModel: serializePivotModel,
        cache: pivotsByIdCache
    });

    return {
        loadPivotsById: (({pivotIds}) => {
            return store.loadById(pivotIds) //Fill in default pivotParameters from template
                .mergeMap(
                    ({ pivot }) => loadTemplatesById({
                        templateIds: [pivot.pivotTemplate.value[1]]
                    }),
                    (pivot, { template }) => ({ pivot, template }))
                .map(({pivot, template}) => {
                    // Must reuse original pivot object
                    for (const fld in template.pivotParametersUI.value) {
                        if (!(fld in pivot.pivot.pivotParameters)) {
                            pivot.pivot.pivotParameters[fld] = template.pivotParametersUI.value[fld].defaultValue;
                        }
                    }
                    return pivot;
                })
            }
        ),
        unloadPivotsById: (({pivotIds}) =>
            store.unloadById(pivotIds)
        ),
        persistPivotsById: (({pivotIds}) =>
            store.persistById(pivotIds)
        ),
        unlinkPivotsById: (({pivotIds}) =>
            store.unlinkById(pivotIds)
        ),
    };
}

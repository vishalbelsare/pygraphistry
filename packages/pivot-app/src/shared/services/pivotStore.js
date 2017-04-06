import { SimpleFileSystemStore } from './support';
import {
    createPivotModel,
    serializePivotModel
} from '../models';
import logger from '../logger.js';
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
        loadPivotsById: (({pivotIds}) =>
            store.loadById(pivotIds) //fill in default pivotParameters from template
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
                })
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

import { SimpleFileSystemStore } from './support';
import {
    createPivotModel,
    serializePivotModel
} from '../models';
import logger from '../logger.js';
const log = logger.createLogger(__filename);


export function pivotStore(loadApp, pathPrefix, pivotsByIdCache = {}) {
    const store = new SimpleFileSystemStore({
        loadApp,
        pathPrefix,
        entityName: 'pivot',
        createModel: createPivotModel,
        serializeModel: serializePivotModel,
        cache: pivotsByIdCache
    })

    return {
        loadPivotsById: (({pivotIds}) =>
            store.loadById(pivotIds)
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

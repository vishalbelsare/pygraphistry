import fs from 'fs';
import glob from 'glob';
import path from 'path';
import { Observable } from 'rxjs';
import SimpleServiceWithCache from './support/simpleServiceWithCache.js';
import {
    createPivotModel,
    serializePivotModel
} from '../models';
import logger from '../logger.js';
const log = logger.createLogger(__filename);


export function pivotStore(loadApp, pathPrefix, pivotsByIdCache = {}) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);
    const writeFileAsObservable = Observable.bindNodeCallback(fs.writeFile);
    const renameAsObservable = Observable.bindNodeCallback(fs.rename);

    const pivots$ = globAsObservable(path.resolve(pathPrefix, '*.json'))
        .mergeMap(x => x)
        .mergeMap(file => {
            return readFileAsObservable(file).map(JSON.parse);
        })

    function getPath(pivot) {
        return path.resolve(pathPrefix, pivot.id + '.json');
    }

    function loadSinglePivotById(pivotId) {
        return pivots$.filter(pivot => pivot.id === pivotId)
    }

    const service = new SimpleServiceWithCache({
        loadApp: loadApp,
        resultName: 'pivot',
        loadById: loadSinglePivotById,
        createModel: createPivotModel,
        cache: pivotsByIdCache
    });

    function loadPivotsById({pivotIds}) {
        return service.loadByIds(pivotIds)
            .do(({pivot}) =>
                log.debug(`Loaded pivot ${pivot.id}`)
            );
    }

    function unloadPivotsById({pivotIds}) {
        return service.unloadByIds(pivotIds)
            .do(({pivot}) =>
                log.debug(`Unloaded pivot ${pivot.id}`)
            );
    }

    function persistPivotsById({pivotIds}) {
        return loadPivotsById({pivotIds})
            .mergeMap(({app, pivot}) => {
                const content = JSON.stringify(serializePivotModel(pivot), null, 4);

                return writeFileAsObservable(getPath(pivot), content)
                    .do(() => service.evictFromCache(pivot.id))
                    .map(() => ({app, pivot}));
            })
            .do(({pivot}) =>
                log.info(`Persisted pivot ${pivot.id}`)
            );
    }

    function unlinkPivotsById({pivotIds}) {
        return loadPivotsById({pivotIds})
            .mergeMap(({app, pivot}) => {
                const filePath = getPath(pivot);

                return renameAsObservable(filePath, `${filePath}.deleted`)
                    .catch(e =>
                        e.code === 'ENOENT' ? Observable.of(null) : Observable.throw(e)
                    )
                    .map(() => ({app, pivot}))
            })
            .do(({pivot}) =>
                log.info(`Unlinked pivot ${pivot.id}`)
            );
    }

    return {
        loadPivotsById,
        unloadPivotsById,
        persistPivotsById,
        unlinkPivotsById,
    };
}

import fs from 'fs';
import glob from 'glob';
import path from 'path';
import { Observable } from 'rxjs';
import SimpleServiceWithCache from './support/simpleServiceWithCache.js';
import {
    createPivotModel,
    serializePivotModel
} from '../models/pivots.js';


export function pivotStore(loadApp, pathPrefix, pivotsByIdCache = {}) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);
    const writeFileAsObservable = Observable.bindNodeCallback(fs.writeFile);

    const pivots$ = globAsObservable(path.resolve(pathPrefix, '*.json'))
        .flatMap(x => x)
        .flatMap(file => {
            return readFileAsObservable(file).map(JSON.parse);
        })

    function loadPivotById(pivotId) {
        return pivots$
            .filter(pivot => pivot.id === pivotId)
    }

    const service = new SimpleServiceWithCache({
        loadApp: loadApp,
        resultName: 'pivot',
        loadById: loadPivotById,
        createModel: createPivotModel,
        cache: pivotsByIdCache
    });

    function loadPivotsById({pivotIds}) {
        return service.loadByIds(pivotIds)
    }

    function savePivotsById({pivotIds}) {
        return loadPivotsById({pivotIds})
            .mergeMap(({app, pivot}) => {
                const filePath = path.resolve(pathPrefix, pivot.id + '.json')
                const content = JSON.stringify(serializePivotModel(pivot), null, 4);

                service.evictFromCache(pivot.id);

                return writeFileAsObservable(filePath, content)
                    .map(() => ({app, pivot}));
            });
    }

    return {
        loadPivotsById,
        savePivotsById
    };
}

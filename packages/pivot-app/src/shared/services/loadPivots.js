import fs from 'fs';
import glob from 'glob';
import { Observable } from 'rxjs';
import SimpleServiceWithCache from './support/simpleServiceWithCache.js';
import { createPivotModel } from '../models/pivots.js';

export function loadPivots(loadApp, globPath, pivotsByIdCache = {}) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);

    const pivots$ = globAsObservable(globPath)
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

    return ({pivotIds: reqIds}) => service.loadByIds(reqIds);
}

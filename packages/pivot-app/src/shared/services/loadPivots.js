import fs from 'fs';
import glob from 'glob';
import path from 'path';
import { Observable } from 'rxjs';
import SimpleServiceWithCache from './support/simpleServiceWithCache.js';
import {
    createPivotModel,
    serializePivotModel
} from '../models/pivots.js';
import util from 'util'


export function pivotStore(loadApp, pathPrefix, pivotsByIdCache = {}) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);
    const writeFileAsObservable = Observable.bindNodeCallback(fs.writeFile);
    const renameAsObservable = Observable.bindNodeCallback(fs.rename);

    const pivots$ = globAsObservable(path.resolve(pathPrefix, '*.json'))
        .flatMap(x => x)
        .flatMap(file => {
            return readFileAsObservable(file).map(JSON.parse);
        })

    function loadPivotById(pivotId, rowIds) {
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

    // rowIds are needed to set 'Pivot #' Attribute (Demo)
    // Should probably remove.
    function loadPivotsById({pivotIds, rowIds, test}) {
        return service.loadByIds(pivotIds, rowIds)
            .map(({app, pivot}, index) => {
                pivot.rowId = rowIds ? rowIds[index] : undefined;
                return ({app, pivot})
            })
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

    function deletePivotsById({pivotIds}) {
        return loadApp()
            .mergeMap((app) =>
                Observable.from(pivotIds)
                    .switchMap(pivotId => {
                        const filePath = path.resolve(pathPrefix, pivotId + '.json');
                        return renameAsObservable(filePath, `${filePath}.deleted`)
                            .catch(e => e.code === 'ENOENT' ? Observable.of(null)
                                                            : Observable.throw(e))
                            .switchMap(() => service.unloadByIds([pivotId]));
                    })
                    .map(() => {app})
            );
    }

    return {
        loadPivotsById,
        savePivotsById,
        deletePivotsById
    };
}

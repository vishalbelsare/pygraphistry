import { Observable } from 'rxjs';
import fs  from 'fs';
import path from 'path';
import glob from 'glob';
import SimpleServiceWithCache from './support/simpleServiceWithCache.js';
import {
    createInvestigationModel,
    serializeInvestigationModel
} from '../models';




export function investigationStore(loadApp, pathPrefix, investigationsByIdCache = {}) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);
    const writeFileAsObservable = Observable.bindNodeCallback(fs.writeFile);
    const renameAsObservable = Observable.bindNodeCallback(fs.rename);

    const investigations$ = globAsObservable(path.resolve(pathPrefix, '*.json'))
        .flatMap(x => x)
        .flatMap(file => {
            return readFileAsObservable(file).map(JSON.parse);
        })

    function getPath(investigation) {
        return path.resolve(pathPrefix, investigation.id + '.json');
    }

    function loadInvestigationById(investigationId) {
        return investigations$
            .filter(investigation => investigation.id === investigationId);
    }

    const service = new SimpleServiceWithCache({
        loadApp: loadApp,
        resultName: 'investigation',
        loadById: loadInvestigationById,
        createModel: createInvestigationModel,
        cache: investigationsByIdCache
    });


    function loadInvestigationsById({investigationIds}) {
        return service.loadByIds(investigationIds)
    }

    function saveInvestigationsById({savePivotsById, investigationIds}) {
        return loadInvestigationsById({investigationIds})
            .mergeMap(({app, investigation}) => {
                investigation.modifiedOn = Date.now()
                const content = JSON.stringify(serializeInvestigationModel(investigation), null, 4);
                const pivotIds = investigation.pivots.map(x => x.value[1])

                return savePivotsById({pivotIds})
                    .switchMap(() => writeFileAsObservable(getPath(investigation), content))
                    .do(() => service.evictFromCache(investigation.id))
                    .map(() => ({app, investigation}));
            });
    }

    function deleteInvestigationsById({deletePivotsById, investigationIds}) {
        return loadInvestigationsById({investigationIds})
            .mergeMap(({app, investigation}) => {
                const pivotIds = investigation.pivots.map(x => x.value[1]);
                const filePath = getPath(investigation);

                return deletePivotsById({pivotIds})
                    .switchMap(() => renameAsObservable(filePath, `${filePath}.deleted`))
                    .catch(e => e.code === 'ENOENT' ? Observable.of(null)
                                                    : Observable.throw(e))
                    .switchMap(() => service.unloadByIds([investigation.id]))
                    .map(() => {app, investigation});
            });
    }

    return {
        loadInvestigationsById,
        saveInvestigationsById,
        deleteInvestigationsById
    };
}

export function listInvestigations(pathPrefix) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);

    return globAsObservable(path.resolve('tests/appdata/investigations', '*.json'))
        .flatMap(x => x)
        .flatMap(file => readFileAsObservable(file).map(JSON.parse))
        .toArray();
}

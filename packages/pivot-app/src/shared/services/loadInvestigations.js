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

    const investigations$ = globAsObservable(path.resolve(pathPrefix, '*.json'))
        .flatMap(x => x)
        .flatMap(file => {
            return readFileAsObservable(file).map(JSON.parse);
        })

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

    function saveInvestigationsById({loadInvestigationsById, savePivotsById, investigationIds}) {
        return loadInvestigationsById({investigationIds})
            .mergeMap(({app, investigation}) => {
                investigation.modifiedOn = Date.now()
                const filePath = path.resolve(pathPrefix, investigation.id + '.json')
                const content = JSON.stringify(serializeInvestigationModel(investigation), null, 4);
                const pivotIds = investigation.pivots.map(x => x.value[1])

                return savePivotsById({pivotIds})
                    .switchMap(() => {
                        service.evictFromCache(investigation.id);
                        return writeFileAsObservable(filePath, content);
                    })
                    .map(() => ({app, investigation}));
            });
    }

    return {
        loadInvestigationsById,
        saveInvestigationsById
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

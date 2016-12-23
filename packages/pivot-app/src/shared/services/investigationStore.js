import { Observable } from 'rxjs';
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import SimpleServiceWithCache from './support/simpleServiceWithCache.js';
import {
    createInvestigationModel,
    serializeInvestigationModel
} from '../models';
import logger from '../logger.js';
const log = logger.createLogger(__filename);


export function investigationStore(loadApp, pathPrefix, investigationsByIdCache = {}) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);
    const writeFileAsObservable = Observable.bindNodeCallback(fs.writeFile);
    const renameAsObservable = Observable.bindNodeCallback(fs.rename);

    const investigations$ = globAsObservable(path.resolve(pathPrefix, '*.json'))
        .mergeMap(x => x)
        .mergeMap(file => {
            return readFileAsObservable(file).map(JSON.parse);
        })

    function getPath(investigation) {
        return path.resolve(pathPrefix, investigation.id + '.json');
    }

    function loadSingleInvestigationById(investigationId) {
        return investigations$
            .filter(investigation =>
                investigation.id === investigationId
            );
    }

    const service = new SimpleServiceWithCache({
        loadApp: loadApp,
        resultName: 'investigation',
        loadById: loadSingleInvestigationById,
        createModel: createInvestigationModel,
        cache: investigationsByIdCache
    });


    function loadInvestigationsById({investigationIds}) {
        return service.loadByIds(investigationIds)
            .do(({investigation}) =>
                log.debug(`Loaded investigation ${investigation.id}`)
            );
    }

    function unloadInvestigationsById({investigationIds}) {
        return service.unloadByIds(investigationIds)
            .do(({investigation}) =>
                log.debug(`Unloaded investigation ${investigation.id}`)
            );
    }

    function persistInvestigationsById({investigationIds}) {
        return loadInvestigationsById({investigationIds})
            .mergeMap(({app, investigation}) => {
                const content = JSON.stringify(serializeInvestigationModel(investigation), null, 4);

                return writeFileAsObservable(getPath(investigation), content)
                    .do(() => service.evictFromCache(investigation.id))
                    .map(() => ({app, investigation}));
            })
            .do(({investigation}) =>
                log.info(`Persisted investigation ${investigation.id}`)
            );
    }

    function unlinkInvestigationsById({investigationIds}) {
        return loadInvestigationsById({investigationIds})
            .mergeMap(({app, investigation}) => {
                const filePath = getPath(investigation);

                return renameAsObservable(filePath, `${filePath}.deleted`)
                    .catch(e =>
                        e.code === 'ENOENT' ? Observable.of(null) : Observable.throw(e)
                    )
                    .map(() => ({app, investigation}))
            })
            .do(({investigation}) =>
                log.info(`Unlinked investigation ${investigation.id}`)
            );
    }

    return {
        loadInvestigationsById,
        unloadInvestigationsById,
        persistInvestigationsById,
        unlinkInvestigationsById,
    };
}

export function listInvestigations(pathPrefix) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);

    return globAsObservable(path.resolve(pathPrefix, '*.json'))
        .mergeMap(x => x)
        .mergeMap(file => readFileAsObservable(file).map(JSON.parse))
        .toArray();
}

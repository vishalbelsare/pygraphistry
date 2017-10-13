import { Observable } from 'rxjs';
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { SimpleFileSystemStore } from './support';
import { createInvestigationModel, serializeInvestigationModel } from '../models';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

const globAsObservable = Observable.bindNodeCallback(glob);
const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);

export function investigationStore(loadApp, pathPrefix, investigationsByIdCache = {}) {
    const store = new SimpleFileSystemStore({
        loadApp,
        pathPrefix,
        entityName: 'investigation',
        createModel: createInvestigationModel,
        serializeModel: serializeInvestigationModel,
        cache: investigationsByIdCache
    });

    return {
        loadInvestigationsById: ({ investigationIds }) => store.loadById(investigationIds),
        unloadInvestigationsById: ({ investigationIds }) => store.unloadById(investigationIds),
        persistInvestigationsById: ({ investigationIds }) => store.persistById(investigationIds),
        unlinkInvestigationsById: ({ investigationIds }) => store.unlinkById(investigationIds)
    };
}

export function listInvestigations(pathPrefix) {
    return globAsObservable(path.resolve(pathPrefix, '*.json'))
        .mergeAll()
        .mergeMap(file => readFileAsObservable(file))
        .map(fileContents => JSON.parse(fileContents))
        .toArray()
        .do(() => log.info(`Read investigations from disk`));
}

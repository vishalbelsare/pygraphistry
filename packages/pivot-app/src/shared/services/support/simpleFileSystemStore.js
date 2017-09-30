import fs from 'fs';
import glob from 'glob';
import path from 'path';
import { Observable, ReplaySubject } from 'rxjs';
import { SimpleCacheService } from '.';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);


const globAsObservable = Observable.bindNodeCallback(glob);
const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);
const writeFileAsObservable = Observable.bindNodeCallback(fs.writeFile);
const renameAsObservable = Observable.bindNodeCallback(fs.rename);


export class SimpleFileSystemStore {
    constructor({loadApp, pathPrefix, entityName, createModel, serializeModel, cache}) {
        this.loadApp = loadApp;
        this.pathPrefix = pathPrefix;
        this.entityName = entityName;
        this.createModel = createModel;
        this.serializeModel = serializeModel;
        this.entities = {};
        this.cacheService = new SimpleCacheService({
            cache, loadApp, createModel, resultName: entityName,
            loadById: (entityId) =>
                this.entities[entityId] || (
                this.entities[entityId] =
                    globAsObservable(path.resolve(pathPrefix, `${entityId}.json`))
                        .mergeAll().take(1).single()
                        .catch(() => (this.entities[entityId] = undefined) || Observable.empty())
                        .mergeMap((file) => readFileAsObservable(file))
                        .map((fileContents) => JSON.parse(fileContents))
                        .multicast(new ReplaySubject(1))
                        .refCount()
                )
        });
    }

    _getPath(entity) {
        return path.resolve(this.pathPrefix, entity.id + '.json');
    }

    loadById(ids) {
        return this.cacheService.loadByIds(ids)
            .do((res) => {
                const entity = res[this.entityName];
                log.debug(`Loaded ${this.entityName} ${entity.id}`)
            });
    }

    unloadById(ids) {
        return this.cacheService.unloadByIds(ids)
            .do((res) => {
                const entity = res[this.entityName];
                log.debug(`Unloaded ${this.entityName} ${entity.id}`)
            });
    }

    persistById(ids) {
        return this.loadById(ids)
            .mergeMap((res) => {
                const entity = res[this.entityName];
                const content = JSON.stringify(this.serializeModel(entity), null, 4);

                return writeFileAsObservable(this._getPath(entity), content)
                    .do(() => this.cacheService.evictFromCache(entity.id))
                    .do(() => this.entities[entity.id] = undefined)
                    .map(() => res);
            })
            .do((res) => {
                const entity = res[this.entityName];
                log.info(`Persisted ${this.entityName} ${entity.id}`)
            });
    }

    unlinkById(ids) {
        return this.loadById(ids)
            .mergeMap((res) => {
                const entity = res[this.entityName];
                const filePath = this._getPath(entity);

                return renameAsObservable(filePath, `${filePath}.deleted`)
                    .catch(e =>
                        e.code === 'ENOENT' ? Observable.of(null) : Observable.throw(e)
                    )
                    .map(() => res)
            })
            .do((res) => {
                const entity = res[this.entityName];
                log.info(`Unlinked ${this.entityName} ${entity.id}`)
            });
    }
}

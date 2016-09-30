import { Observable, ReplaySubject } from 'rxjs';

export default class SimpleServiceWithCache {
    constructor({loadApp, resultName, loadById, createModel, cache = {}}) {
        this.loadApp = loadApp;
        this.resultName = resultName;
        this.loadById = loadById;
        this.createModel = createModel
        this.cache = cache;
    }

    lookupId(reqId) {
        if (reqId in this.cache) {
            return this.cache[reqId];
        } else {
            const result$ = this.loadById(reqId, this.loadApp)
                .multicast(new ReplaySubject(1))
                .refCount();
            return this.cache[reqId] = result$;
        }
    }

    evictFromCache(reqId) {
        delete this.cache[reqId];
    }

    loadByIds(reqIds) {
        const index = `${this.resultName}sById`

        return this.loadApp().mergeMap(
            (app) => {
                return Observable.from(reqIds)
                    .flatMap((id) => {
                        if (id in app[index]) {
                            return Observable.from([app[index][id]])
                        } else {
                            return this.lookupId(id)
                                .map(this.createModel)
                                .do(result => app[index][id] = result)
                        }
                    })
            },
            (app, result) => {
                let res = {app: app}
                res[this.resultName] = result;
                return res;
            }
        )
    }
}

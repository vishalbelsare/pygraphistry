import { Observable, ReplaySubject } from 'rxjs';

export class SimpleCacheService {
    constructor({ loadApp, resultName, loadById, createModel, cache }) {
        this.loadApp = loadApp;
        this.resultName = resultName;
        this.loadById = loadById;
        this.createModel = createModel;
        this.cache = cache;
    }

    lookupId(reqId) {
        if (reqId in this.cache) {
            return this.cache[reqId];
        } else {
            const result$ = this.loadById(reqId, this.loadApp)
                .multicast(new ReplaySubject(1))
                .refCount();
            this.cache[reqId] = result$;
            return result$;
        }
    }

    evictFromCache(reqId) {
        delete this.cache[reqId];
    }

    unloadByIds(reqIds) {
        const index = `${this.resultName}sById`;

        return this.loadApp().mergeMap(
            app =>
                Observable.from(reqIds).switchMap(reqId => {
                    this.evictFromCache(reqId);

                    if (reqId in app[index]) {
                        const result = app[index][reqId];
                        delete app[index][reqId];
                        return Observable.of(result);
                    } else {
                        return Observable.empty();
                    }
                }),
            (app, result) => ({ app, [this.resultName]: result })
        );
    }

    loadByIds(reqIds) {
        const index = `${this.resultName}sById`;

        return this.loadApp().mergeMap(
            app => {
                return Observable.from(reqIds).flatMap(id => {
                    if (app[index] && app[index][id]) {
                        return Observable.from([app[index][id]]);
                    } else {
                        return this.lookupId(id)
                            .map(this.createModel)
                            .do(result => (app[index][id] = result));
                    }
                });
            },
            (app, result) => ({ app, [this.resultName]: result })
        );
    }
}

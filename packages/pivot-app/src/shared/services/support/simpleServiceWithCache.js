import { Observable, ReplaySubject } from 'rxjs';

export default class SimpleServiceWithCache {
    constructor({loadApp, resultName, loadById, cache = {}}) {
        this.loadApp = loadApp;
        this.resultName = resultName;
        this.loadById = loadById;
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

    loadByIds(reqIds) {
        return this.loadApp().mergeMap(
            () => Observable.from(reqIds).flatMap((id) => this.lookupId(id)),
            (app, result) => {
                app[this.resultName] = result;
                return app;
            }
        )
    }
}

import { Observable, Subscription } from 'rxjs';
import removeExpressRoute from 'express-remove-route';

export function addExpressRoutes(app, routes) {

    return function addExpressRoutesOnSubscribe(subscription) {

        routes.forEach(({ route, all, use, get, put, post, delete: del }) => {
            const idx = route ? 1 : 0;
            const args = route ? [route] : [];
            if (all) {
                args[idx] = all;
                app.all.apply(app, args);
            } else if (use) {
                args[idx] = use;
                app.use.apply(app, args);
            } else {
                if (get) {
                    args[idx] = get;
                    app.get.apply(app, args);
                }
                if (put) {
                    args[idx] = put;
                    app.put.apply(app, args);
                }
                if (post) {
                    args[idx] = post;
                    app.post.apply(app, args);
                }
                if (del) {
                    args[idx] = del;
                    app.delete.apply(app, args);
                }
            }
        });

        return Observable.of({});
    }
}

export function removeExpressRoutes(app, routes) {
    return function removeExpressRoutesOnDispose() {
        return new Subscription(function disposeVizWorker() {
            routes
                .filter(({ route }) => route)
                .forEach(({ route }) => {
                    try {
                        removeExpressRoute(app, route)
                    } catch(e) {
                        // todo: log routes we can't remove?
                    }
                });
        });
    }
}

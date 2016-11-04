import { Observable } from 'rxjs';
import { mapObjectsToAtoms } from './support/mapObjectsToAtoms.js';
import { app } from './app';
import { pivots } from './pivots';
import { investigations } from './investigations';
import { users } from './users';
import { templates } from './templates';


export function routes(services) {
    return ([]
        .concat(app(services))
        .concat(pivots(services))
        .concat(investigations(services))
        .concat(users(services))
        .concat(templates(services))
    ).map(wrapRouteHandlers);
}

function wrapRouteHandlers(route) {
    const handlers = ['get', 'set', 'call'];

    handlers.forEach(handler => {
        if (typeof route[handler] === 'function') {
            route[handler] = wrapRouteHandler(route, handler);
        }
    });

    return route;
}

function wrapRouteHandler(route, handler) {
    const originalHandler = route[handler];

    return function routeHandlerWrapper(...args) {
        return Observable
            .defer(() => originalHandler.apply(this, args) || [])
            .map(mapObjectsToAtoms)
            .catch(e => {
               console.error(route.route, e);
            });
    }
}

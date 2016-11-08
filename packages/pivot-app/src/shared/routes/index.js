import { Observable } from 'rxjs';
import { mapObjectsToAtoms } from './support/mapObjectsToAtoms.js';
import { logErrorWithCode } from './support/logErrorWithCode.js';
import { app } from './app';
import { pivots } from './pivots';
import { investigations } from './investigations';
import { users } from './users';
import { templates } from './templates';
import {
    pathValue as $pathValue,
    error as $error
} from '@graphistry/falcor-json-graph';

import logger from '@graphistry/common/logger2.js';
const log = logger.createLogger('pivot-app', __filename);


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
        log.debug({
            falcorReqPath: args[0],
            falcorArgs: args[1],
            falcorOp: handler,
        }, 'Falcor request');

        return Observable
            .defer(() => originalHandler.apply(this, args) || [])
            .map(mapObjectsToAtoms)
            .do(res =>
                log.trace({
                    falcorReqPath: args[0],
                    falcorReqArgs: args[1],
                    falcorResPath: res.path,
                    falcorResValue: res.value,
                    falcorOp: handler,
                }, 'Faclor reply')
            )
            .catch(e => {
                const errorContext = {
                    err: e,
                    falcorPath: args[0],
                    falcorArgs: args[1],
                    falcorOp: handler
                };
                const code = logErrorWithCode(log, errorContext);

                return Observable.from([
                    $pathValue('serverStatus',
                        $error({
                            ok: false,
                            title: 'Ooops!',
                            message: `Unexpected server error (code: ${code}).`
                        })
                    )
                ])
            });
    }
}

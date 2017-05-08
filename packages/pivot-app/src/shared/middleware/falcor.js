import { Observable } from 'rxjs';
import { App } from 'pivot-shared/main';
import Router from '@graphistry/falcor-router';
import { $error, $pathValue } from '@graphistry/falcor-json-graph';
import { logErrorWithCode, mapObjectsToAtoms } from 'pivot-shared/util';

import logger from 'pivot-shared/logger.js';
const log = logger.createLogger(__filename);

export function getDataSourceFactory(services) {

    const AppRouter = createAppRouter(App
        .schema(services)
        .toArray()
        .map(wrapRouteHandlers)
    );

    return function getDataSource(request, _streaming = false) {
        if (!request.user) {
            throw new Error('Request is not tagged with a user (no auth middleware?)');
        }
        return new AppRouter({
            request, _streaming,
            userId: request.user.userId
        });
    }
}

function createAppRouter(routes, options = { bufferTime: 10 }) {
    return class AppRouter extends Router.createClass(routes, options) {
        constructor(options = {}) {
            super(options);
            for (const key in options) {
                if (options.hasOwnProperty(key)) {
                    this[key] = options[key];
                }
            }
            this.routeUnhandledPathsTo({
                get(paths) {
                    log.error({falcorReqPath: paths}, 'Unhandled get');
                    return Observable.empty();
                },
                set(jsonGraphEnv) {
                    log.error({falcorReqPath: jsonGraphEnv}, 'Unhandled set');
                    return Observable.of(jsonGraphEnv);
                },
                call(callPath, args, refPaths, thisPaths) {
                    log.error({
                        falcorReqPath: callPath,
                        falcorArgs: args,
                        refPaths: refPaths,
                        thisPaths: thisPaths
                    }, 'Unhandled call');
                    return Observable.empty();
                }
            });
        }
    }
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
        log.trace({
            falcorReqPath: args[0],
            falcorArgs: args[1],
            falcorOp: handler,
        }, 'Falcor request');

        return Observable
            .defer(() => originalHandler.apply(this, args) || [])
            .timeout(200000)
            .map(mapObjectsToAtoms)
            .do(({ path, value }) => {
                if (value === undefined) {
                    log.warn(`Get handler is returning undefined for ${JSON.stringify(path)}`);
                }
            })
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

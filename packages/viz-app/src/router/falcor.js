import { logger as log } from '@graphistry/common';
import { routes as schema } from 'viz-app/schema';
import FalcorRouter from '@graphistry/falcor-router';
import JSONGraphError from '@graphistry/falcor-router/src/errors/JSONGraphError';
import CallNotFoundError from '@graphistry/falcor-router/src/errors/CallNotFoundError';
import MaxPathsExceededError from '@graphistry/falcor-router/src/errors/MaxPathsExceededError';
import CallRequiresPathsError from '@graphistry/falcor-router/src/errors/CallRequiresPathsError';
const logger = log.createLogger('viz-app', 'src/router/falcor.js');

function configureFalcorRouter(services, env = { bufferTime: 10, streaming: false }) {
    let AppRouter = createAppRouter(env, schema(services));

    // Hot reload the Falcor Routes
    if (module.hot) {
        module.hot.accept('viz-app/schema', () => {
            const nextSchema = require('viz-app/schema').routes; // eslint-disable-line global-require
            AppRouter = createAppRouter(env, nextSchema(services));
        });
    }

    return function getDataSource(req, reqConfig = { bufferTime: 10, streaming: false }) {
        return new AppRouter(req, reqConfig);
    };
}

export { configureFalcorRouter };
export default configureFalcorRouter;

export function createAppRouter(env, routes) {
    const AppRouterBase = FalcorRouter.createClass(routes, env);
    return class AppRouter extends AppRouterBase {
        constructor(request = {}, requestConfig = {}) {
            super(requestConfig);
            this.request = request;
            const { debug, streaming, bufferTime, ...options } = requestConfig || {};
            for (const key in options) {
                this[key] = options[key];
            }
            this.routeUnhandledPathsTo({
                get(paths) {
                    logger.warn({ paths }, `Falcor-router unhandled get`);
                    return Observable.empty();
                },
                set(jsonGraphEnv) {
                    logger.warn({ jsonGraphEnv }, `Falcor-router unhandled set`);
                    return Observable.of(jsonGraphEnv);
                },
                call(callPath, args, refPaths, thisPaths) {
                    logger.warn(
                        { callPath, args, refPaths, thisPaths },
                        `Falcor-router unhandled call`
                    );
                }
            });
        }
        get(paths) {
            return super.get(paths).do(null, err => {
                if (
                    err instanceof JSONGraphError ||
                    err instanceof CallNotFoundError ||
                    err instanceof MaxPathsExceededError ||
                    err instanceof CallRequiresPathsError
                ) {
                    logger.error(
                        { requestType: 'get', err, paths },
                        `Falcor Router get error: ${(err && err.constructor.name) ||
                            'Unknown Error'}`
                    );
                }
            });
        }
        set(jsonGraphEnv) {
            return super.set(jsonGraphEnv).do(null, err => {
                if (
                    err instanceof JSONGraphError ||
                    err instanceof CallNotFoundError ||
                    err instanceof MaxPathsExceededError ||
                    err instanceof CallRequiresPathsError
                ) {
                    logger.error(
                        { requestType: 'set', err, jsonGraphEnv },
                        `Falcor Router set error: ${(err && err.constructor.name) ||
                            'Unknown Error'}`
                    );
                }
            });
        }
        call(callPath, args, refPaths, thisPaths) {
            return super.call(callPath, args, refPaths, thisPaths).do(null, err => {
                if (
                    err instanceof JSONGraphError ||
                    err instanceof CallNotFoundError ||
                    err instanceof MaxPathsExceededError ||
                    err instanceof CallRequiresPathsError
                ) {
                    logger.error(
                        { requestType: 'call', err, callPath, args, refPaths, thisPaths },
                        `Falcor Router call error: ${(err && err.constructor.name) ||
                            'Unknown Error'}`
                    );
                }
            });
        }
    };
}

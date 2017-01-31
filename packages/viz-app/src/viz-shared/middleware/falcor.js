import { logger as log } from '@graphistry/common';
const logger = log.createLogger('viz-shared', 'src/viz-shared/middleware/falcor.js');
import { inspect } from 'util';
import { Observable } from 'rxjs';
import { falcor as routes } from '../routes';
import Router from '@graphistry/falcor-router';
import JSONGraphError from '@graphistry/falcor-router/src/errors/JSONGraphError';
import CallNotFoundError from '@graphistry/falcor-router/src/errors/CallNotFoundError';
import MaxPathsExceededError from '@graphistry/falcor-router/src/errors/MaxPathsExceededError';
import CallRequiresPathsError from '@graphistry/falcor-router/src/errors/CallRequiresPathsError';

export function getDataSourceFactory(services) {

    let AppRouter = createAppRouter(routes(services));

    if (module.hot) {
        // Enable Webpack hot module replacement for routes
        module.hot.accept('../routes', () => {
            const routes = require('../routes').falcor;
            AppRouter = createAppRouter(routes(services));
        });
    }

    return function getDataSource(request = {}, _streaming = false) {
        return new AppRouter({
            request, _streaming, options: { ...request.query }
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
                    logger.warn({paths}, 'Falcor app router: unhandled "get"');
                    return Observable.empty();
                },
                set(jsonGraphEnv) {
                    logger.warn({jsonGraphEnv}, 'Falcor app router: unhandled "set"');
                    return Observable.of(jsonGraphEnv);
                },
                call(callPath, args, refPaths, thisPaths) {
                    logger.warn({callPath, args, refPaths, thisPaths}, 'Falcor app router: unhandled "call"');
                }
            });
        }
        get(paths) {
            return super.get(paths).do(null, (err) => {
                if (err instanceof JSONGraphError ||
                    err instanceof CallNotFoundError ||
                    err instanceof MaxPathsExceededError ||
                    err instanceof CallRequiresPathsError){
                    logger.error(
                        {err, paths, requestType: 'get'},
                        `Falcor Router get error: ${err && err.constructor.name || 'Unknown Error'}`
                    );
                }
            });
        }
        set(values) {
            return super.set(values).do(null, (err) => {
                if (err instanceof JSONGraphError ||
                    err instanceof CallNotFoundError ||
                    err instanceof MaxPathsExceededError ||
                    err instanceof CallRequiresPathsError){
                    logger.error(
                        {err, values, requestType: 'set'},
                        `Falcor Router set error: ${err && err.constructor.name || 'Unknown Error'}`
                    );
                }
            });
        }
        call(callPath, args, refPaths, thisPaths) {
            return super.call(callPath, args, refPaths, thisPaths).do(null, (err) => {
                if (err instanceof JSONGraphError ||
                    err instanceof CallNotFoundError ||
                    err instanceof MaxPathsExceededError ||
                    err instanceof CallRequiresPathsError){
                    logger.error(
                        {err, callPath, args, refPaths, thisPaths, requestType: 'call'},
                        `Falcor Router call error: ${err && err.constructor.name || 'Unknown Error'}`
                    );
                }
            });
        }
    };
}

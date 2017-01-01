import { Observable } from 'rxjs';
import { routes } from '../routes';
import Router from '@graphistry/falcor-router';
import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);


export function getDataSourceFactory(services) {

    const AppRouter = createAppRouter(routes(services));

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

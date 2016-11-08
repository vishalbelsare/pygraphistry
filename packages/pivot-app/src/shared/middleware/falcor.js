import { inspect } from 'util';
import { Observable } from 'rxjs';
import { routes } from '../routes';
import Router from '@graphistry/falcor-router';
import logger from '@graphistry/common/logger2.js';
const log = logger.createLogger('pivot-app', __filename);


export function getDataSourceFactory(services) {

    const AppRouterBase = Router.createClass(routes(services));

    class AppRouter extends AppRouterBase {
        constructor(options = {}) {
            super();
            for (const key in options) {
                if (options.hasOwnProperty(key)) {
                    this[key] = options[key];
                }
            }
            this.routeUnhandledPathsTo({
                get(paths) {
                    log.error({falcorReqPath: path}, 'Unhandled get');
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

    return function getDataSource(request) {
        return new AppRouter({ request });
    }
}

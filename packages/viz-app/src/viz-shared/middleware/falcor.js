import { logger as log } from '@graphistry/common';
const logger = log.createLogger('viz-shared', 'src/viz-shared/middleware/falcor.js');
import { inspect } from 'util';
import { Observable } from 'rxjs';
import { falcor as routes } from '../routes';
import Router from '@graphistry/falcor-router';

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
        // get(paths) {
        //     console.log('\n============requested paths:');
        //     console.log('\t' + paths
        //         .map((path) => JSON.stringify(path))
        //         .join('\n\t') + '\n');
        //     return super.get(paths);
        // }
    };
}

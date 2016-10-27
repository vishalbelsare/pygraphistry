import { inspect } from 'util';
import { Observable } from 'rxjs';
import _ from 'underscore';
import { falcor as routes } from '../routes';
import Router from '@graphistry/falcor-router';
import { mapObjectsToAtoms }  from '../routes/mapObjectsToAtoms.js'

let logger;
if (__CLIENT__) {

} else {
    const commonLogger = require('@graphistry/common/logger.js');
    console.log('commonLogger', commonLogger);
    logger = commonLogger.createLogger('viz-shared','viz-shared/middleware/falcor.js');
}

export function getDataSourceFactory(services) {
    const rs = routes(services);
    //console.log('WS', wrapRoutes(rs));

    let AppRouter = createAppRouter(rs);

    if (module.hot) {
        // Enable Webpack hot module replacement for routes
        module.hot.accept('../routes', () => {
            const routes = require('../routes').falcor;
            AppRouter = createAppRouter(routes(services));
        });
    }

    return function getDataSource(request = {}) {
        return new AppRouter({
            request, options: { ...request.query }
        });
    }
}

function wrapRoutes(routes) {
    function wrap(route, handlerName) {
        console.log('wrapping', handlerName, 'for', route.route)
        const handler = route[handlerName];
        return function(path, args) {
            return Observable.defer(() => handler(path, args))
                .map(mapObjectsToAtoms)
                .catch(e => {
                    logger && logger.error(e, `Failure in route ${route.route}.${handlerName} handler`);
                    return Observable.throw(e);
                })
        }
    }

    return routes.map((route) => {
        const newRoute = _.extend({}, route)
        ['get', 'set', 'call'].forEach(handlerName => {
            if (_.keys(newRoute).includes(handlerName)) {
                newRoute[handlerName] = wrap(newRoute, handlerName);
            }
        })

        return newRoute;
    });
}

function createAppRouter(routes) {
    return class AppRouter extends Router.createClass(routes) {
        constructor(options = {}) {
            super();
            for (const key in options) {
                if (options.hasOwnProperty(key)) {
                    this[key] = options[key];
                }
            }
            this.routeUnhandledPathsTo({
                get(paths) {
                    console.log('============unhandled get:');
                    console.log(`paths: ${inspect(paths, { depth: null })}`);
                    return Observable.empty();
                },
                set(jsonGraphEnv) {
                    console.log('============unhandled set:');
                    console.log(`jsonGraphEnv: ${inspect(jsonGraphEnv, { depth: null })}`);
                    return Observable.of(jsonGraphEnv);
                },
                call(callPath, args, refPaths, thisPaths) {
                    console.log('============unhandled call:');
                    console.log(`callPath: ${inspect(callPath, { depth: null })}`);
                    console.log(`args: ${inspect(args, { depth: null })}`);
                    console.log(`refPaths: ${inspect(refPaths, { depth: null })}`);
                    console.log(`thisPaths: ${inspect(thisPaths, { depth: null })}`);
                    return Observable.empty();
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

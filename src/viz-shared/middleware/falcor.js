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

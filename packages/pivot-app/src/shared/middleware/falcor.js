import { inspect } from 'util';
import { Observable } from 'rxjs';
import { routes } from '../routes';
import Router from '@graphistry/falcor-router';

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
    }

    return function getDataSource(request) {
        return new AppRouter({ request });
    }
}

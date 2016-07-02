import { Router } from 'reaxtor';
import { Observable } from '@graphistry/rxjs';
import { falcorRoutes } from '../routes/falcor';

export function getDataSourceFactory(services) {

    const AppRouterBase = Router.createClass(falcorRoutes(services));

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
                    console.log('unhandled paths:');
                    console.log(paths
                        .map((path) => JSON.stringify(path))
                        .join('\n'));
                    return Observable.empty();
                },
                set(jsonGraphEnv) {
                    return Observable.of(jsonGraphEnv);
                }
            });
        }
    }

    return function getDataSource(request) {
        return new AppRouter({ request });
    }
}

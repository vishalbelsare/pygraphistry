import { Router } from 'reaxtor';
import { Observable } from '@graphistry/rxjs';
import { falcorRoutes } from '../routes/falcor';

export function getDataSourceFactory(services, routesSharedState) {

    const AppRouterBase = Router.createClass(falcorRoutes(services, routesSharedState));

    class AppRouter extends AppRouterBase {
        constructor(options = {}) {
            super();
            for (const key in options) {
                if (options.hasOwnProperty(key)) {
                    this[key] = options[key];
                }
            }
            this.routeUnhandledPathsTo({
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

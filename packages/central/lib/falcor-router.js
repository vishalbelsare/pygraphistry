import Router from 'falcor-router';
import { workerRoutes } from './routes/worker-routes';

const FalcorRouterBase = Router.createClass([].concat(
    workerRoutes()
));

export function FalcorRouter(opts) {
    for (const key in opts) {
        if (opts.hasOwnProperty(key)) {
            this[key] = opts[key];
        }
    }
    FalcorRouterBase.call(this);
}

FalcorRouter.prototype = Object.create(FalcorRouterBase.prototype);

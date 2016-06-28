import { routes } from './routes';
import Router from 'falcor-router';

const FalcorRouterBase = Router.createClass(routes());

export function FalcorRouter(opts) {
    for (const key in opts) {
        if (opts.hasOwnProperty(key)) {
            this[key] = opts[key];
        }
    }
    FalcorRouterBase.call(this);
}

FalcorRouter.prototype = Object.create(FalcorRouterBase.prototype);

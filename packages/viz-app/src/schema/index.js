import { logger as commonLogger } from '@graphistry/common';
const logger = commonLogger.createLogger('viz-app:falcor-router');

import { app } from './app';
import { views } from './views';
import { scene } from './scene';
import { labels } from './labels';
import { axis } from './axis';
import { layout } from './layout';
import { legend } from './legend';
import { camera } from './camera';
import { toolbar } from './toolbar';
import { session } from './session';
import { selection } from './selection';
import { workbooks } from './workbooks';
import { encodings } from './encodings';
import { inspector } from './inspector';

import { filters } from './filters';
import { exclusions } from './exclusions';
import { histograms } from './histograms';
import { expressions } from './expressions';

import { Observable } from 'rxjs/Observable';
import { mapObjectsToAtoms } from 'viz-app/router/mapObjectsToAtoms';

export function routes(services) {
    const workbook = `workbooksById[{keys}]`;
    const view = `${workbook}.viewsById[{keys}]`;

    return []
        .concat(
            ...[
                app(services),

                workbooks([], ``)(services),

                views(['workbook', 'view'], `${view}`)(services),
                toolbar(['workbook', 'view'], `${view}`)(services),

                scene(['workbook', 'view'], `${view}`)(services),
                camera(['workbook', 'view'], `${view}`)(services),

                labels(['workbook', 'view'], `${view}`)(services),
                legend(['workbook', 'view'], `${view}`)(services),
                axis(['workbook', 'view'], `${view}`)(services),
                layout(['workbook', 'view'], `${view}`)(services),
                session(['workbook', 'view'], `${view}`)(services),
                selection(['workbook', 'view'], `${view}`)(services),

                inspector(['workbook', 'view'], `${view}`)(services),

                filters(['workbook', 'view'], `${view}`)(services),
                exclusions(['workbook', 'view'], `${view}`)(services),
                histograms(['workbook', 'view'], `${view}`)(services),
                expressions(['workbook', 'view'], `${view}`)(services),

                encodings(['workbook', 'view'], `${view}`)(services)
            ]
        )
        .map(wrapRouteHandlers);
}

function wrapRouteHandlers(route) {
    const wrapped = {};
    if (typeof route.get === 'function') {
        wrapped.get = wrapRouteHandler(route.get, route.route, 'get');
    }
    if (typeof route.set === 'function') {
        wrapped.set = wrapRouteHandler(route.set, route.route, 'set');
    }
    if (typeof route.call === 'function') {
        wrapped.call = wrapRouteHandler(route.call, route.route, 'call');
    }
    return { ...route, ...wrapped };
}

function wrapRouteHandler(handler, route, type) {
    const handlerName =
        handler.name && handler.name !== 'handler' ? handler.name : 'unknown route handler';

    return function routeHandlerWrapper(...args) {
        return Observable.defer(() => handler.apply(this, args) || [])
            .map(mapObjectsToAtoms)
            .do({
                next(handlerReturn) {
                    logger.trace(
                        {
                            input: args,
                            handler: handlerName,
                            route,
                            type,
                            ...handlerReturn
                        },
                        `Called Falcor route: ${handlerName}`
                    );
                },
                error(err) {
                    logger.error(
                        {
                            input: args,
                            handler: handlerName,
                            route,
                            type,
                            err
                        },
                        'Bad Falcor route'
                    );
                }
            });
    };
}

import { logger as commonLogger } from '@graphistry/common';
const logger = commonLogger.createLogger('viz-app:falcor-router');

import { app } from './app';
import { views } from './views';
import { labels } from './labels';
import { layout } from './layout';
import { toolbar } from './toolbar';
import { session } from './session';
import { selection } from './selection';
import { workbooks } from './workbooks';
import { scene, camera } from './scene';
import { encodings } from './encodings';
import { inspector } from './inspector';

import { Observable } from 'rxjs/Observable';
import { mapObjectsToAtoms, captureErrorStacks } from 'viz-shared/routes';
import { filters, exclusions, histograms, expressions } from './expressions';

export function routes(services) {

    const workbook = `workbooksById[{keys}]`;
    const view = `${workbook}.viewsById[{keys}]`;

    return ([].concat(...[

        app(services),

        workbooks([], ``)(services),

        views(['workbook', 'view'], `${view}`)(services),
        toolbar(['workbook', 'view'], `${view}`)(services),

        scene(['workbook', 'view'], `${view}`)(services),
        camera(['workbook', 'view'], `${view}`)(services),

        labels(['workbook', 'view'], `${view}`)(services),
        layout(['workbook', 'view'], `${view}`)(services),
        session(['workbook', 'view'], `${view}`)(services),
        selection(['workbook', 'view'], `${view}`)(services),

        inspector(['workbook', 'view'], `${view}`)(services),

        filters(['workbook', 'view'], `${view}`)(services),
        exclusions(['workbook', 'view'], `${view}`)(services),
        histograms(['workbook', 'view'], `${view}`)(services),
        expressions(['workbook', 'view'], `${view}`)(services),

        encodings(['workbook', 'view'], `${view}`)(services),
    ])).map(wrapRouteHandlers);
}

function wrapRouteHandlers(route) {
    const wrapped = {};
    if (typeof route.get === 'function') {
        wrapped.get = wrapRouteHandler(route.get);
    }
    if (typeof route.set === 'function') {
        wrapped.set = wrapRouteHandler(route.set);
    }
    if (typeof route.call === 'function') {
        wrapped.call = wrapRouteHandler(route.call);
    }
    return { ...route, ...wrapped };
}

function wrapRouteHandler(handler) {
    const handlerName = (handler.name && handler.name !== 'handler') ?
        handler.name : 'unknown route handler';

    return function routeHandlerWrapper(...args) {
        return Observable
            .defer(() => handler.apply(this, args) || [])
            .map(mapObjectsToAtoms)
            .do(
                (handlerReturn) => {
                    logger.trace({handler: handlerName, ...handlerReturn}, `Called Falcor route: ${handlerName}`)
                }, (err) => {
                    logger.error({err, handler: handlerName, input: args}, 'Bad Falcor route');
                }
            )
    }
}

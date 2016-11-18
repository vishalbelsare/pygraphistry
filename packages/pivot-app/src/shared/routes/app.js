import { Observable } from 'rxjs';
import {
    ref as $ref,
    pathValue as $pathValue,
    pathInvalidation as $invalidation,
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    rangesToListItems
} from './support';


export function app({ loadApp, createInvestigation, loadUsersById }) {
    const appGetRoute = getHandler([], loadApp);

    return [{
        route: `['title']`,
        returns: `String`,
        get: appGetRoute,
    }, {
        route: `['serverStatus']`,
        returns: `Object`,
        get: appGetRoute,
    }];
}

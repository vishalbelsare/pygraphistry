import {
    getHandler,
} from './support';


export function app({ loadApp }) {
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

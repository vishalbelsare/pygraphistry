import {
    getHandler,
    setHandler
} from './support';


export function users({ loadApp, loadUsersById }) {
    const appGetRoute = getHandler([], loadApp);

    return [{
        route: `currentUser`,
        get: appGetRoute,
        returns: `$ref('usersById[{userId}]'`
    }, {
        route: `['usersById'][{keys}]['activeScreen']`,
        get: getHandler(['user'], loadUsersById),
        set: setHandler(['user'], loadUsersById),
        returns: `String`,
    }, {
        returns: `Number`,
        route: `['usersById'][{keys}]['investigations'].length`,
        get: getHandler(['user'], loadUsersById)
    }, {
        route: `['usersById'][{keys}]['investigations'][{keys}]`,
        get: getHandler(['user'], loadUsersById),
        returns: `$ref('investigationsById[{investigationId}]')`
    }];
}

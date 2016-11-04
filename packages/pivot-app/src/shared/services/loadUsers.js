export function userStore(loadApp) {
    function loadUsersById({ userIds }) {
        return loadApp()
            .mergeMap(
                (app) => userIds.filter((userId) => (
                    userId in app.usersById
                )),
                (app, userId) => ({
                    app, user: app.usersById[userId]
                })
            );
    }

    return {
        loadUsersById: loadUsersById
    };
}


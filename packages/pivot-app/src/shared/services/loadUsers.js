import { ReplaySubject } from 'rxjs';
import { makeTestUser } from 'pivot-shared/models';

export function userStore({ loadApp, convict, listTemplates, listConnectors, listInvestigations }) {
    const templates = listTemplates();
    const connectors = listConnectors();
    const investigationsObs = listInvestigations()
        .take(1)
        .multicast(new ReplaySubject(1))
        .refCount();

    function loadUsersById({ userIds }) {
        return loadApp()
            .zip(investigationsObs)
            .mergeMap(([app, investigations]) =>
                userIds.map(userId => ({
                    app,
                    user:
                        app.usersById[userId] ||
                        (app.usersById[userId] = {
                            ...makeTestUser(
                                investigations,
                                templates,
                                connectors,
                                convict.get('graphistry.key'),
                                convict.get('graphistry.host')
                            ),
                            id: userId
                        })
                }))
            );
    }

    return {
        loadUsersById: loadUsersById
    };
}

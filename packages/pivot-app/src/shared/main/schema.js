import { withSchema } from '@graphistry/falcor-react-schema';

import { User } from 'pivot-shared/user';
import { Pivot } from 'pivot-shared/pivots';
import { Template } from 'pivot-shared/templates';
import { Connector } from 'pivot-shared/connectors';
import { Investigation } from 'pivot-shared/investigations';

export default withSchema((QL, { get, set }, services) => {
    const { loadApp } = services;
    const readOnlyHandler = {
        get: get(loadApp)
    };

    return QL`{
        ['title', 'currentUser', 'serverStatus']: ${readOnlyHandler},
        usersById: {
            [{ keys: userIds }]: ${User.schema(services)}
        },
        pivotsById: {
            [{ keys: pivotIds }]: ${Pivot.schema(services)}
        },
        templatesById: {
            [{ keys: templateIds }]: ${Template.schema(services)}
        },
        connectorsById: {
            [{ keys: connectorIds }]: ${Connector.schema(services)}
        },
        investigationsById: {
            [{ keys: investigationIds }]: ${Investigation.schema(services)}
        }
    }`;
});

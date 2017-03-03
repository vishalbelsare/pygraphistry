import {
    ref as $ref
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';
import _ from 'underscore';


export function makeTestUser(investigations, templates, connectors, apiKey, graphistryHost) {
    const suffix = '/graph/graph.html?bg=%23eeeeee&type=vgraph&info=false&logo=false';

    const investigationsRefs = investigations.map(investigation =>
        $ref(`investigationsById['${investigation.id}']`)
    );

    const templatesRefs = _.sortBy(templates, 'name').map(template =>
        $ref(`templatesById['${template.id}']`)
    );

    const connectorRefs = _.sortBy(connectors, 'name').map(connector =>
        $ref(`connectorsById['${connector.id}']`)
    );

    return {
        name: 'Administrator',
        id: '0',
        activeScreen: 'home',
        activeInvestigation: investigationsRefs[0],
        investigations: investigationsRefs,
        connectors: connectorRefs,
        templates: templatesRefs,
        apiKey: apiKey,
        vizService: `${graphistryHost}${suffix}`,
        etlService: `${graphistryHost}/etl`,
    };
}

export function createAppModel(testUser, id = simpleflake().toJSON()) {
    return {
        id,
        title: 'Pivots',
        investigationsById: {},
        pivotsById: {},
        connectorsById: {},
        templatesById: {},
        usersById: {
            '0': testUser
        },
        currentUser: $ref(`usersById['0']`),
        serverStatus: {ok: true}
    };
}

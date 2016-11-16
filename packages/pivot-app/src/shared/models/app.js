import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';
import { createInvestigationModel } from '../models';
import _ from 'underscore';


export function makeTestUser(investigations, templates, connectors, apiKey, graphistryHost) {
    const suffix = '/graph/graph.html?play=2000&bg=%23eeeeee&type=vgraph';

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
        connectorsById: {
            'splunk-connector' : {
                id: 'splunk-connector',
                name: 'Splunk',
                lastUpdated: new Date().toLocaleString(),
                status: {
                    level: 'info',
                    message: null
                }
            },
            'whois-connector' : {
                id: 'whois-connector',
                name: 'WHOIS',
                lastUpdated: new Date().toLocaleString(),
                status: {
                    level: 'info',
                    message: null
                }
            }
        },
        templatesById: {},
        usersById: {
            '0': testUser
        },
        currentUser: $ref(`usersById['0']`),
        serverStatus: {ok: true}
    };
}

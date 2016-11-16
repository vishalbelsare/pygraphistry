import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';
import { createInvestigationModel } from '../models';
import _ from 'underscore';


export function makeTestUser(investigations, templates, apiKey, graphistryHost) {
    const suffix = '/graph/graph.html?play=2000&bg=%23eeeeee&type=vgraph';

    const investigationsRefs = investigations.map(investigation =>
        $ref(`investigationsById['${investigation.id}']`)
    );

    const templatesRefs = _.sortBy(templates, 'name').map(template =>
        $ref(`templatesById['${template.id}']`)
    );

    return {
        name: 'Administrator',
        id: '0',
        activeScreen: 'home',
        activeInvestigation: investigationsRefs[0],
        investigations: investigationsRefs,
        connectors: [$ref(`connectorsById['0']`), $ref(`connectorsById['1']`)],
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
            '0' : {
                id: '0',
                name: 'splunk-connector',
                lastUpdated: new Date().toLocaleString(),
                status: 'info'
            },
            '1' : {
                id: '1',
                name: 'whois',
                lastUpdated: new Date().toLocaleString(),
                status: 'success'
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

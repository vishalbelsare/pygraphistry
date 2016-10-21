import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';
import { createInvestigationModel } from '../models';
import _ from 'underscore';

export function makeTestUser(investigations, templates) {
    const suffix = '/graph/graph.html?play=2000&bg=%23eeeeee&type=vgraph&info=true';
    const padenKey = 'd6a5bfd7b91465fa8dd121002dfc51b84148cd1f01d7a4c925685897ac26f40b';

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
        templates: templatesRefs,
        apiKey: process.env.GRAPHISTRY_API_KEY || padenKey,
        vizService: `${process.env.GRAPHISTRY_VIEWER || 'https://labs.graphistry.com'}${suffix}`,
        etlService: `${process.env.GRAPHISTRY_ETL || 'https://labs.graphistry.com'}/etl`,
    };
}

export function createAppModel(testUser, id = simpleflake().toJSON()) {
    return {
        id,
        title: 'Pivots',
        investigationsById: {},
        pivotsById: {},
        templatesById: {},
        usersById: {
            '0': testUser
        },
        currentUser: $ref(`usersById['0']`)
    };
}

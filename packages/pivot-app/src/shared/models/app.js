import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';
import { createInvestigationModel } from '../models';
import _ from 'underscore';

export function makeTestUser(investigations) {
    const suffix = '/graph/graph.html?play=2000&bg=%23eeeeee&type=vgraph&info=true';
    const padenKey = 'd6a5bfd7b91465fa8dd121002dfc51b84148cd1f01d7a4c925685897ac26f40b';

    return {
        name: 'Administrator',
        id: '0',
        activeScreen: 'home',
        investigations: investigations.map((investigation, index) => (
            $ref(`investigationsById['${investigation.id}']`)
        )),
        apiKey: process.env.GRAPHISTRY_API_KEY || padenKey,
        vizService: `${process.env.GRAPHISTRY_VIEWER || 'https://labs.graphistry.com'}${suffix}`,
        etlService: `${process.env.GRAPHISTRY_ETL || 'https://labs.graphistry.com'}/etl`,
    };
}

export function createAppModel(testUser, id = simpleflake().toJSON()) {
    return {
        id,
        title: 'Pivots',

        /**
         *  investigationsById: {
         *    'investigations-id-1': {
         *      ....
         *    }, ...
         *  }
         */
        investigationsById: {},

        selectedInvestigation: testUser.investigations[0],

        /**
         *  pivotsById: {
         *    'pivot-id-1': {
         *       id: 'pivot-id-1',
         *       pivotParamters: ...,
         *       ...
         *    }
         *  }
         */
        pivotsById: {},

        currentUser: $ref(`usersById['0']`),

        usersById: {
            '0': testUser
        }
    };
}

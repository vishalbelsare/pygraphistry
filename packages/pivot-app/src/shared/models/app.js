import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';
import { createInvestigationModel } from '../models';
import _ from 'underscore';


function makeTestUser(investigations){
    const suffix = '/graph/graph.html?play=2000&bg=%23eeeeee&type=vgraph&info=true';
    const padenKey = 'd6a5bfd7b91465fa8dd121002dfc51b84148cd1f01d7a4c925685897ac26f40b';

    return {
        name: 'Bobby Bobo',
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

export function app(_investigations = [], id = simpleflake().toJSON()) {

    const investigations = _investigations.map((inv, idx) =>
        createInvestigationModel(inv, idx)
    );

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
        investigationsById : investigations.reduce((investigations, investigation) => ({
            ...investigations, [investigation.id]: investigation
        }), {}),

        /**
         *  investigations: [
         *     $ref(`investigationsById['investigation-id-1']`) , ...
         *  ]
         */
        /*investigations: investigations.map((investigation, index) => (
            $ref(`investigationsById['${investigation.id}']`)
        )),*/

        selectedInvestigation: $ref(`investigationsById['${investigations[0].id}']`),

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
            '0': makeTestUser(investigations)
        }
    };
}

import stringhash from 'string-hash';
import logger from '../../../logger.js';
const log = logger.createLogger(__filename);


import { Neo4jPivot } from './neo4jPivot.js';


export const searchNeo4j = new Neo4jPivot({
    id: 'search-neo4j-plain',
    name: 'Search Neo4j',
    tags: ['Neo4j'],
    parameters: [
        {
            name: 'query',
            inputType: 'textarea',
            label: 'Query:',
            placeholder: 'error',
            defaultValue: 'error',
        }
    ],
    toNeo4j: function (args) {
        return args.query || ''; 
    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type || '') % 12;
            }
        }
    }
});

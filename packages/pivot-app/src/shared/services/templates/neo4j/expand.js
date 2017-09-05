import stringhash from 'string-hash';
import logger from '../../../logger.js';
const log = logger.createLogger(__filename);


import { Neo4jPivot } from './neo4jPivot.js';
import { encodings } from './settings.js';


export const expandNeo4j = new Neo4jPivot({
    id: 'expand-neo4j',
    name: 'Expand with Neo4j',
    tags: ['Demo'],
    parameters: [
        {
            name: 'ref',
            inputType: 'pivotCombo',
            label: 'Any field in:',
        },
        {
            name: 'fields',
            inputType: 'multi',
            label: 'Expand on:'
        }
    ],
    encodings,
    toNeo4j: function (args, pivotCache) {
    
        log.info('Neo4j args', args);

        const fields = (args.fields||{}).value || [];
        const refPivot = args.ref.value[0];
        const pivot = pivotCache[refPivot].results.labels;

        let whereClause = '';
        if (fields.length) {
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                const vals = 
                    pivot
                        .filter((node) => node.node && (node.type === field))
                        .map((node) => node.node);
                const fieldMatchLeft = ` OR ID(s) = ${ vals.join(` OR ID(s) =`) }`;
                const fieldMatchRight = ` OR ID(c) = ${ vals.join(` OR ID(c) =`) }`;
                if (vals.length) {
                    whereClause = whereClause + fieldMatchLeft + fieldMatchRight;
                }
            }
        } else {
            const vals = 
                pivot
                    .filter((node) => node.node)
                    .map((node) => node.node);
            const fieldMatchLeft = ` OR ID(s) = ${ vals.join(` OR ID(s) =`) }`;
            const fieldMatchRight = ` OR ID(c) = ${ vals.join(` OR ID(c) =`) }`;
            if (vals.length) {
                whereClause = whereClause + fieldMatchLeft + fieldMatchRight;
            }            
        }

        return `MATCH (s)-[b]->(c) WHERE false ${ whereClause } RETURN s, b, c`;
        
    },
});
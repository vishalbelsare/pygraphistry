import { pivots as splunkPivots } from './splunk/index.js'
// export * from './neo4j/index.js'
import { pivots as blazegraphPivots } from './blazegraph.js';
import { pivots as httpPivots } from './http';
import { pivots as manualPivots } from './manual.js';
import { pivots as systemPivots } from './systemTemplates';

import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);



export const pivots = 
	[].concat(
		splunkPivots||[], blazegraphPivots||[], httpPivots||[],
		manualPivots||[], systemPivots||[])
	.filter(pivot => {

		if (!pivot) {
			log.error('NULL PIVOT');
			throw new Error('Null pivot');
		}

		['id', 'name', 'tags', 'searchAndShape', 'parameters' ]
		.forEach((fld) => {
		 	if (!pivot[fld]) {
		 		log.error('Pivot missing field', fld, pivot);
		 		throw new Error({msg: 'Pivot missing field', fld, pivot});
		 	}
		});

		return true;	
	});
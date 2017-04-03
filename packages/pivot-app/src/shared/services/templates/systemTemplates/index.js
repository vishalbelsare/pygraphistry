import logger from '../../../logger.js';
const log = logger.createLogger(__filename);

import conf from '../../../../server/config.js';
import { deriveTemplate } from './systemTemplates';


// {id -> template}
module.exports = conf.get('systemTemplates.pivots').reduce(
	(mod, pivot = {}) => {		
		const { id, name, template } = pivot;
		try {
			log.info('Adding system pivot', {id, name, 'base': template});
			mod[id] = deriveTemplate(template, pivot);
		} catch (e) {
			log.error(`Failure to load user pivot ${id} (${name})`, e);
		}
		return mod;
	}, {});
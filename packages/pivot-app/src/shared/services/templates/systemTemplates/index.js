import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);
const conf = global.__graphistry_convict_conf__;
import { deriveTemplate } from './systemTemplates';


// {id -> template}
export const derivedTemplates = conf
	.get('systemTemplates.pivots')
	.reduce((mod, {template, ...settings}) => {
		const { id, name } = settings;
		try {
			log.info('Adding system pivot', {id, name, 'base': template});
			mod[id] = deriveTemplate(template, settings);
		} catch (e) {
			log.error(`Failure to load user pivot ${id} (${name})`, e);
		}
		return mod;
	}, {});
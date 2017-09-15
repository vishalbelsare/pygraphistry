import _ from 'underscore';

import * as webmps from './fireeye/webmps.js';
import * as pan from './paloaltonetworks/pa.js';
import * as splunk from './splunk.js';
const encodings = [webmps, pan, splunk];


//[ {[fld] -> a ] * String -> a
function combineEncodings (encodings, field) {
	return encodings.reduce(
		(acc,lib) => ({...acc, ...lib[field]}),
		{});
}

function combineArrays(encodings, field) {
	return _.unique([].concat.apply([], encodings.map((o) => o[field] || [])));
}

export const colTypes 			= combineEncodings(encodings, 'colTypes');

export const defaultFields 		= combineArrays(encodings, 'defaultFields');
export const desiredAttributes 	= combineArrays(encodings, 'desiredAttributes');
export const desiredEntities 	= combineArrays(encodings, 'desiredEntities');
export const fieldsBlacklist 	= combineArrays(encodings, 'fieldsBlacklist');
export const attributesBlacklist = combineArrays(encodings, 'attributesBlacklist');
export const entitiesBlacklist	 = combineArrays(encodings, 'entitiesBlacklist');



import _ from 'underscore';

import * as webmps from './fireeye/webmps.js';
import * as hx from './fireeye/hx.js';
import * as pan from './paloaltonetworks/pa.js';
import * as splunk from './splunk.js';
const encodings = [webmps, hx, pan, splunk];

//{<name> -> {product, productIdentifier, ...}}
export const products = encodings.reduce((acc, v) => ({...acc, [v.product]: v}), {});


//[ {[fld] -> a} ] * String -> {[fld] -> a}
function combineEncodings (encodings, field) {
	return encodings.reduce(
		(acc,lib) => ({...acc, ...lib[field]}),
		{});
}

function combineArrays(encodings, field) {
	return _.unique([].concat.apply([], encodings.map((o) => o[field] || [])));
}

export const colTypes 			= combineEncodings(encodings, 'colTypes');
export const refTypes 			= combineEncodings(encodings, 'refTypes');

export const defaultFields 		= combineArrays(encodings, 'defaultFields');
export const desiredAttributes 	= combineArrays(encodings, 'desiredAttributes');
export const desiredEntities 	= combineArrays(encodings, 'desiredEntities');
export const fieldsBlacklist 	= combineArrays(encodings, 'fieldsBlacklist');
export const attributesBlacklist = combineArrays(encodings, 'attributesBlacklist');
export const entitiesBlacklist	 = combineArrays(encodings, 'entitiesBlacklist');



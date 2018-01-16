import _ from 'underscore';

import * as cylance from './cylance/protect.js';
import * as es from './elasticsearch/elasticsearch.js';
import * as esGeo from './elasticsearch/geoip.js';
import * as f5 from './f5/waf.js';
import * as hx from './fireeye/hx.js';
import * as pan from './paloaltonetworks/pa.js';
import * as splunk from './splunk.js';
import * as windows from './microsoft/windows.js';
import * as webmps from './fireeye/webmps.js';
const encodings = [cylance, es, esGeo, f5, hx, pan, splunk, webmps, windows];

//{<name> -> {product, productIdentifier, ...}}
export const products = encodings.reduce((acc, v) => ({ ...acc, [v.product]: v }), {});

//[ {[fld] -> a} ] * String -> {[fld] -> a}
function combineEncodings(encodings, field) {
    return encodings.reduce((acc, lib) => ({ ...acc, ...lib[field] }), {});
}

function combineArrays(encodings, field) {
    return _.unique([].concat.apply([], encodings.map(o => o[field] || [])));
}

export const colTypes = combineEncodings(encodings, 'colTypes');
export const refTypes = combineEncodings(encodings, 'refTypes');

export const defaultFields = combineArrays(encodings, 'defaultFields');
export const desiredAttributes = combineArrays(encodings, 'desiredAttributes');
export const desiredEntities = combineArrays(encodings, 'desiredEntities');
export const fieldsBlacklist = combineArrays(encodings, 'fieldsBlacklist');
export const attributesBlacklist = combineArrays(encodings, 'attributesBlacklist');
export const entitiesBlacklist = combineArrays(encodings, 'entitiesBlacklist');

import { HTTP_EXPAND } from '../http/httpExpand.js';
import { HTTP_SEARCH } from '../http/httpSearch.js';
import { MANUAL } from '../manual.js';

const baseTemplates = [HTTP_EXPAND, HTTP_SEARCH, MANUAL].reduce((acc, pivot) => {
  acc[pivot.id] = pivot;
  return acc;
}, {});

// string * {k: v} -> template
export function deriveTemplate(templateID, settings) {
  if (!(templateID in baseTemplates)) {
    throw new Error(`Unknown base template ID ${templateID} 
			for deriving template ${(settings || {}).id}`);
  }

  return baseTemplates[templateID].clone(settings);
}

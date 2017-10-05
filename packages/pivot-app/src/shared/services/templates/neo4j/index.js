import { pivots as searchPivots } from './search.js';
import { pivots as expandPivots } from './expand.js';

export const pivots = (searchPivots || []).concat(expandPivots || []);
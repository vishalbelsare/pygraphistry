import { pivots as demoPivots } from './demos/index.js';
import { pivots as searchPivots } from './search.js';
import { pivots as expandPivots } from './expand.js';

export const pivots = [].concat(demoPivots || [], searchPivots || [], expandPivots || []);

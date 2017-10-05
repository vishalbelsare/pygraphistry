import { pivots as alertPivots } from './alertDemo.js';
import { pivots as eventPivots } from './eventGen.js';
import { pivots as healthPivots } from './health.js';
import { pivots as miscPivots } from './misc.js';

export const pivots = 
	[].concat(alertPivots||[], eventPivots||[], healthPivots||[], miscPivots||[]);
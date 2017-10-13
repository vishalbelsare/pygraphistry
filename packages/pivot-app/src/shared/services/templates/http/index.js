import { pivots as search } from './httpSearch';
import { pivots as expand } from './httpExpand';

export const pivots = [].concat(search || [], expand || []);

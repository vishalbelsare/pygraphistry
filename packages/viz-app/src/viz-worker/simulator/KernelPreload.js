import { controls } from './layout.config.js';
import _ from 'underscore';

import MoveNodes from './moveNodes.js';
import MoveNodesByIds from './moveNodesByIds.js';
import SelectNodesInCircle from './SelectNodesInCircle.js';
import SelectNodesInRect from './SelectNodesInRect.js';

import { logger as log } from '@graphistry/common';
const logger = log.createLogger('graph-viz', 'simulator/KernelPreload.js');


export function preload (clContext, kernelCache) {

	controls.default.forEach( (cfg) => {
		cfg.layoutAlgorithms.forEach( ({algo, params}) => {	
		
			const compiled = new algo(clContext, kernelCache);

		});
	});

	new MoveNodes(clContext, kernelCache);
	new MoveNodesByIds(clContext, kernelCache);
	new SelectNodesInCircle(clContext, kernelCache);
	new SelectNodesInRect(clContext, kernelCache);

}

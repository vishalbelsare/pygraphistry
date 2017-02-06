//////////////////////////////////////////////////////
// 
//  Initialize CL context, precompile kernels, etc.
//  Provided memoized values for later reuse
//
//////////////////////////////////////////////////////


import { controls } from './layout.config.js';
import _ from 'underscore';

import _config from '@graphistry/config';
import { Renderer } from 'viz-shared/renderers';
import * as CLjs from './cl';
import KernelCache from './KernelCache';


import MoveNodes from './moveNodes.js';
import MoveNodesByIds from './moveNodesByIds.js';
import SelectNodesInCircle from './SelectNodesInCircle.js';
import SelectNodesInRect from './SelectNodesInRect.js';

import { logger as log } from '@graphistry/common';
const logger = log.createLogger('graph-viz', 'simulator/KernelPreload.js');


//////////////////////////////////////////////////////


let preloadedValue = null;

export function initialize () {

	if (preloadedValue) {
		throw new Error('initialize() called more than one time');
	}

	preloadedValue = initializeGlobals();
	warm(preloadedValue);

}

export function preloaded () {
	
	if (!preloadedValue) {
		throw new Error('preload() run before initialize()');
	}

	return preloadedValue;
}



//////////////////////////////////////////////////////



function initializeGlobals () {

	const { GPU_OPTIONS: { vendor, device } = {} } = _config();

	const renderer = new Renderer();
	const contexts = CLjs.createSync(renderer, device, vendor);
	const kernelCache = new KernelCache();

	return { vendor, device, renderer, contexts, kernelCache };

}

function warm ({ vendor, device, renderer, contexts, kernelCache }) {

	controls.default.forEach( (cfg) => {
		cfg.layoutAlgorithms.forEach( ({algo, params}) => {			
			const compiled = new algo(contexts, kernelCache);
		});
	});

	new MoveNodes(contexts, kernelCache);
	new MoveNodesByIds(contexts, kernelCache);
	new SelectNodesInCircle(contexts, kernelCache);
	new SelectNodesInRect(contexts, kernelCache);

}

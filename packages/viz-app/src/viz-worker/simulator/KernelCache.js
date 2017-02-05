import  Kernel  from './kernel.js';


import { logger as log } from '@graphistry/common';
const logger      = log.createLogger('graph-viz', 'simulator/kernel/KernelCache.js');


export default function KernelCache () {

	this.name2kernel = {};

}

KernelCache.prototype.fetchOrCreate = function (name, argNames, argTypes, file, clContext) {

	logger.info('==== KERNEL', name);

	if (this.name2kernel[name]) {
		logger.info(`== KERNEL: FETCHED ${name}`);
		return this.name2kernel[name];
	} else {
		logger.info(`== KERNEL: CREATED ${name}`);
		this.name2kernel[name] = new Kernel(name, argNames, argTypes, file, clContext);
		return this.name2kernel[name];
	}

};
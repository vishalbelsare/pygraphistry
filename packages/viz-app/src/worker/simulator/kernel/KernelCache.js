import Kernel from './kernel.js';

import { logger as log } from '@graphistry/common';
const logger = log.createLogger('graph-viz', 'simulator/kernel/KernelCache.js');

export default class KernelCache {
    constructor() {
        this.argsToKernel = {};
    }

    fetchOrCreate = function(name, argNames, argTypes, file, clContext, loadtimeConstants) {
        const key = file + ':' + argNames.join(' ');

        if (!this.argsToKernel[key]) {
            this.argsToKernel[key] = new Kernel(
                name,
                argNames,
                argTypes,
                file,
                clContext,
                loadtimeConstants
            );
        }

        return this.argsToKernel[key];
    };
}

import Kernel from './kernel.js';

import { logger as log } from '@graphistry/common';
const logger = log.createLogger('graph-viz', 'simulator/kernel/KernelCache.js');

export default function KernelCache() {
  this.argsToKernel = {};
}

KernelCache.prototype.fetchOrCreate = function(name, argNames, argTypes, file, clContext) {
  //known to be cacheable
  const whitelist = [
    //THESE RECOMPILE AT RUNTIME SOME REASON
    //'to_barnes_layout',
    //'bound_box',
    //'build_tree',
    //'compute_sums',
    //'sort',
    //'calculate_forces',

    'faEdgeMap',
    'segReduce',
    'faSwingsTractions',
    'faIntegrate',
    'moveNodes',
    'moveNodesByIds',
    'selectNodesInRect',
    'selectNodesInCircle'
  ];

  const key = file + ':' + argNames.join(' ');

  if (whitelist.indexOf(name) > -1 && this.argsToKernel[key]) {
    return this.argsToKernel[key];
  } else {
    const kernel = new Kernel(name, argNames, argTypes, file, clContext);

    if (whitelist.indexOf(name) > -1) {
      kernel.compile();
    }

    this.argsToKernel[key] = kernel;
    return kernel;
  }
};

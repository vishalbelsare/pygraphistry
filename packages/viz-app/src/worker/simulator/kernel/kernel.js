'use strict';

import Q from 'q';
import * as ocl from 'node-opencl';

import * as util from '../util';
import * as cljs from '../cl';

import { logger as log } from '@graphistry/common';
const logger = log.createLogger('graph-viz', __filename);

////////////////////


// Disable debug logging since this file is responsible for 90% of log output.
// Comment me for local debugging.
//debug = function () {}
//Q.longStackSupport = true;

//TODO: Alternative way of doing this, since we aren't using debug module anymore
// Set synchronous based on debug value
let synchronous = false;
if (process.env.DEBUG && process.env.DEBUG.indexOf('perf') !== -1) {
  logger.trace('Kernel ' + name + ' is synchronous because DEBUG=perf');
  synchronous = true;
}


////////////////////


//String * [ String ] * {[String] -> clType} -> ()
function validate(name, argNames, argTypes) {

  // Sanity Checks
  argNames.forEach(arg => {
    if (!(arg in argTypes)) {
      logger.die('In Kernel %s, argument %s has no type', name, arg);
    }
  });

}

function compileHelper({ name, source, clContext, params: { loadtimeConstants, runtimeConstants } }) {


  logger.trace('Compiling kernel', name);

  const prefix = 
    Object.entries({...loadtimeConstants, ...runtimeConstants})
      .map(([key, { val }]) => 
        
        typeof val === 'string' || typeof val === 'number' || val === true 
        ? '#define ' + key + ' ' + val
        
        : val === null 
        ? '#define ' + key
        
        : null)
      .filter(x => x)
      .join('\n');
  logger.trace('Prefix', prefix);  

  const t0 = Date.now();
  return source.then(source => {
    const processedSource = prefix + '\n\n' + source;    
    return clContext.compile(processedSource, [name]).then(kernels => kernels[name]);
  }).then(x => {
    logger.trace('===== COMPILE', name, (Date.now() - t0)/1000, 's');
    return x;
  })
}

function callHelper({name, clContext}, kernel, workItems, buffers, workGroupSize) {
  // TODO: Consider acquires and releases of buffers.
  const queue = clContext.queue;
  logger.trace(
    { kernelName: name, workItems, workGroupSize },
    'Enqueuing kernel %s',
    name
  );
  ocl.enqueueNDRangeKernel(queue, kernel, 1, null, workItems, workGroupSize || null);
  if (synchronous) {
    logger.trace('Waiting for kernel to finish');
    ocl.finish(queue);
  }
}


////////////////////


export default class Kernel {

  compile () {
    const { name, source, clContext, params } = this;
    return compileHelper({ name, source, clContext, params });
  }

  constructor(name, argNames, argTypes, file, clContext, loadtimeConstants = {}) {

    logger.trace({kernelName: name, file: file}, `Creating Kernel: ${name}`);

    validate(name, argNames, argTypes);

    this.name = name;    
    this.argNames = argNames; //ordered
    this.argTypes = argTypes;
    this.source = util.getKernelSource(file);    
    this.clContext = clContext;
    
    //{[class]: {[id]: {dirty: bool, val: *} } }
    const params = {
        args:
          Object.assign({},
            ...argNames
              .filter(arg => argTypes[arg] !== cljs.types.define)
              .map(arg => ({[arg]: { dirty: true, val: loadtimeConstants[arg] } }))),                              
        loadtimeConstants: 
          Object.assign({NODECL: { val: null }},
            ...argNames
              .filter(arg => (argTypes[arg] === cljs.types.define) &&  (arg in loadtimeConstants))
              .map(arg => ({[arg]: { val: loadtimeConstants[arg] } }))),
        runtimeConstants:
          Object.assign({},
            ...argNames
              .filter(arg => (argTypes[arg] === cljs.types.define) && !(arg in loadtimeConstants))
              .map(arg => ({[arg]: { val: null } })))
    };
    this.params = params;

    // If kernel has no runtime defines, compile right away
    this.qKernel = Object.keys(params.runtimeConstants).length ? Q(null) : this.compile();

  }

  // Just params; constants handled automatically by compile
  setAllArgs(kernel) {

    const { name, argNames, argTypes, params: { args } } = this;

    logger.trace(`Setting arguments for kernel ${name}`);

    argNames
      .filter(arg => arg in args)
      .forEach((arg, i) => {
        try {
          const { dirty, val } = args[arg];
          const type = argTypes[arg] || 'cl_mem';
          if (val === null) {
            logger.trace(`In kernel ${name}, argument ${arg} is null`);
          }

          if (dirty) {
            logger.trace('Setting arg %d type %s of kernel %s to value %s', i, type, name, val);
            ocl.setKernelArg(kernel, i, type, val);
            args[arg].dirty = false;
          }

        } catch (e) {
          log.makeQErrorHandler(logger, `Error setting argument ${arg} of kernel ${name}`);
        }
      });

    return this;

  }

  // {[id] -> 'a} -> KernelClass
  // both params and constants
  set(newArgs) {

    const { name, args, params } = this;

    logger.trace({ kernelName: name, arguements: args }, 'Setting args for kernel: %s', name);

    let mustRecompile = false;
    Object.entries(newArgs).forEach(([arg, val]) => {
      if (arg in params.args) {
        if (val === undefined || val === null) {
          logger.trace('Setting argument %s to %s', arg, val);
        }
        params.args[arg] = { dirty: true, val };
      } else if (arg in params.loadtimeConstants) {
        if (val !== params.loadtimeConstants[arg].val) {        
          const msg = {msg: `Kernel ${name} attempted a runtime override of loadtime argument ${arg}`, name, arg};
          logger.error(msg);
          throw new Error(msg);
        }
      } else if (arg in params.runtimeConstants) {
        if (val !== params.runtimeConstants[arg].val) {
          mustRecompile = true;
          logger.trace('=== MUST RECOMPILE BECAUSE', name, {arg, val});
        }
        params.runtimeConstants[arg] = { val };
      } else {
        const msg = {msg: 'Kernel %s has no argument/define named %s', name, arg};
        logger.error(msg);
        throw new Error(msg);
      }
    });

    if (mustRecompile) {
      const t0 = Date.now();
      this.qKernel = this.compile();
    }

    return this;
  }

 
  get (arg) {
    
    const { params } = this;

    const bucket = Object.values(params)
      .filter(bucket => arg in bucket)
      .concat([null])[0]; //null if no hits      
    if (!bucket) {
      return logger.warn('Kernel %s has no parameter %s', name, arg);
    }

    return bucket[arg].val;

  }

  //kernel, workItems, buffers, workGroupSize -> 'a
  call(...args) {
    return callHelper({name: this.name, clContext: this.clContext}, ...args);
  }



  // [Int] * [String] -> Promise[Kernel]
  exec(numWorkItems, resources, workGroupSize) {

    const { qKernel } = this;

    return qKernel.then(kernel => {
      if (kernel === null) {
        logger.error('Kernel is not compiled, aborting');
        return Q();
      } else {
        this.setAllArgs(kernel);
        return this.call(kernel, numWorkItems, resources, workGroupSize);
      }
    });

  };
  
}


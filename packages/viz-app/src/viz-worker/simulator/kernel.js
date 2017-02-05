'use strict';

const _ = require('underscore');
const Q = require('q');
const sprintf = require('sprintf-js').sprintf;
const util = require('./util');

const cljs = require('./cl.js');
const ocl = require('node-opencl');
const config = require('@graphistry/config')();

const log         = require('@graphistry/common').logger;
const logger      = log.createLogger('graph-viz', 'graph-viz/js/kernel.js');

// Disable debug logging since this file is responsible for 90% of log output.
// Comment me for local debugging.
//debug = function () {}
//Q.longStackSupport = true;


// String * [String] * {String: Type} * String * clCtx
export default function Kernel (name, argNames, argTypes, file, clContext) {
    logger.trace({kernelName: name,
                file: file}, 'Creating Kernel: %s', name);

    const that = this;
    this.name = name;
    this.argNames = argNames;
    // Q promise
    const source = util.getKernelSource(file);

    //TODO: Alternative way of doing this, since we aren't using debug module anymore
    // Set synchronous based on debug value
    let synchronous = false;
    if (process.env.DEBUG && process.env.DEBUG.indexOf('perf') !== -1) {
        logger.trace('Kernel ' + name + ' is synchronous because DEBUG=perf');
        synchronous = true;
    }

    // For gathering performance data
    this.timings = [];
    this.totalRuns = 0;
    const maxTimings = 100;

    // Sanity Checks
    _.each(argNames, (arg) => {
        if (!(arg in argTypes)) {
            logger.die('In Kernel %s, argument %s has no type', name, arg);
        }
    });

    function isDefine(arg) {
        return argTypes[arg] === cljs.types.define;
    }
    const args = _.reject(argNames, isDefine);
    const defines = _.filter(argNames, isDefine).concat(['NODECL']);

    const defVal = {dirty: true, val: null};
    const argValues = _.object(
        _.map(args, (argName) => [argName, defVal])
    );
    const defValues = _.object(
        _.map(defines, (argName) => [argName, null])
    );
    Object.seal(argValues);
    Object.seal(defValues);

    // If kernel has no defines, compile right away
    let qKernel = _.without(defines, 'NODECL').length === 0 ? compile() : Q(null);

    // {String -> Value} -> Kernel
    this.set = function (args) {
        logger.trace({'kernelName': this.name, 'arguements': args}, 'Setting args for kernel: %s', this.name);

        let mustRecompile = false;
        _.each(args, (val, arg) => {
            if (arg in argValues) {
                if (val === undefined || val === null) {
                    logger.trace('Setting argument %s to %s', arg, val);
                }

                argValues[arg] = {dirty: true, val: val};
            } else if (arg in defValues) {
                if (val !== defValues[arg]) {
                    mustRecompile = true;
                }
                defValues[arg] = val;
            } else {
                logger.die('Kernel %s has no argument/define named %s', name, arg);
            }
        });

        if (mustRecompile) {
            qKernel = compile();
        }

        return this;
    };

    this.get = function(arg) {
        if (_.contains(defines, arg)) {
            return defValues[arg];
        } else if (_.contains(args, arg)) {
            return argValues[arg].val;
        } else {
            logger.warn('Kernel %s has no parameter %s', name, arg);
            return undefined;
        }
    };

    function compile () {
        logger.trace('Compiling kernel', that.name);

        _.each(defValues, (arg, val) => {
            if (val === null) {
                logger.die('Define %s of kernel %s was never set', arg, name);
            }

        });

        const prefix = _.flatten(_.map(defValues, (val, key) => {
            if (typeof val === 'string' || typeof val === 'number' || val === true) {
                return ['#define ' + key + ' ' + val];
            } else if (val === null) {
                return ['#define ' + key];
            } else {
                return [];
            }
        }), true).join('\n');
        logger.trace('Prefix', prefix);

        return source.then((source) => {
            const processedSource = prefix + '\n\n' + source;
            // TODO: Alternative way of doing this, since we aren't using debug module anymore
            // if (config.ENVIRONMENT === 'local') {
            //     const debugFile = path.resolve(__dirname, '..', 'kernels', file + '.debug');
            //     fs.writeFileSync(debugFile, processedSource);
            // }

            return clContext.compile(processedSource, [name])
                .then((kernels) => kernels[name]);
        });
    }
    this.compile = compile; 

    function setAllArgs(kernel) {
        logger.trace({kernelName: name}, 'Setting arguments for kernel');
        let i;
        try {
            for (i = 0; i < args.length; i++) {
                const arg = args[i];
                const val = argValues[arg].val;
                const dirty = argValues[arg].dirty;
                const type = argTypes[arg] || 'cl_mem';
                if (val === null) {
                    logger.trace('In kernel %s, argument %s is null', name, arg);
                }

                if (dirty) {
                    logger.trace('Setting arg %d type %s of kernel %s to value %s', i, type, name, val);
                    ocl.setKernelArg(kernel, i, type, val);
                    argValues[arg].dirty = false;
                }
            }

        } catch (e) {
            log.makeQErrorHandler(logger, 'Error setting argument %s of kernel %s', args[i], name)(e);
        }
    }

    function call(kernel, workItems, buffers, workGroupSize) {
        // TODO: Consider acquires and releases of buffers.

        const queue = clContext.queue;
        logger.trace({kernelName: that.name}, 'Enqueuing kernel %s', that.name);
        const start = process.hrtime();
        ocl.enqueueNDRangeKernel(queue, kernel, 1, null, workItems, workGroupSize || null);
        if (synchronous) {
            logger.trace('Waiting for kernel to finish');
            ocl.finish(queue);
            const diff = process.hrtime(start);
            that.timings[that.totalRuns % maxTimings] = (diff[0] * 1000 + diff[1] / 1000000);
        }
        that.totalRuns++;
        return Q(that);
    }

    // [Int] * [String] -> Promise[Kernel]
    this.exec = function(numWorkItems, resources, workGroupSize) {
        return qKernel.then((kernel) => {
            if (kernel === null) {
                logger.error('Kernel is not compiled, aborting');
                return Q();
            } else {
                setAllArgs(kernel);
                return call(kernel, numWorkItems, resources, workGroupSize);
            }
        });
    };
};

// () -> Stats
Kernel.prototype.runtimeStats = function () {
    const runs = this.timings.length;
    const mean =  _.reduce(this.timings, ((a, b) => a + b), 0) / runs;
    const stdDev =
        _.reduce(this.timings, (acc, t) => {
            return acc + (t - mean) * (t - mean);
        }, 0) / (runs > 1 ? runs - 1 : runs);

    const pretty = sprintf('%25s:%4s ±%4s        #runs:%4d', this.name,
                         mean.toFixed(0), stdDev.toFixed(0), this.totalRuns);
    return {
        name: this.name,
        runs: this.totalRuns,
        mean: mean,
        stdDev: stdDev,
        pretty: pretty
    };
};

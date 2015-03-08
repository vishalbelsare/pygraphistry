'use strict';

var _ = require('underscore');
var Q = require('q');
var debug = require('debug')('graphistry:graph-viz:cl:kernel');
var sprintf = require('sprintf-js').sprintf;
var path = require('path');
var fs = require('fs');
var util = require('./util');
var cljs = require('./cl.js');
var config = require('config')();


// String * [String] * {String: Type} * String * clCtx
var Kernel = function (name, argNames, argTypes, file, clContext) {
    debug('Creating Kernel', name);

    var that = this;
    this.name = name;
    this.argNames = argNames;
    var source = util.getKernelSource(file);

    // Set synchronous based on debug value
    var synchronous = true;
    if (process.env.DEBUG && process.env.DEBUG.indexOf('perf') != -1) {
        util.info('Kernel ' + name + ' is synchronous because DEBUG=perf');
        synchronous = true;
    }

    // For gathering performance data
    this.timings = [];
    this.totalRuns = 0;
    var maxTimings = 100

    // Sanity Checks
    _.each(argNames, function (arg) {
        if (!(arg in argTypes))
            util.die('In Kernel %s, argument %s has no type', name, arg);
    });

    function isDefine(arg) {
        return argTypes[arg] === cljs.types.define;
    };
    var args = _.reject(argNames, isDefine);
    var defines = _.filter(argNames, isDefine).concat(['NODECL']);

    var defVal = {dirty: true, val: null};
    var argValues = _.object(
        _.map(args, function (name) { return [name, defVal]; })
    );
    var defValues = _.object(
        _.map(defines, function (name) { return [name, defVal]; })
    );
    Object.seal(argValues);
    Object.seal(defValues);

    // If kernel has no defines, compile right away
    var qKernel = _.without(defines, 'NODECL').length === 0 ? compile() : Q(null);

    // {String -> Value} -> Kernel
    this.set = function (args) {
        debug('Setting args for kernel', this.name);

        var mustRecompile = false;
        _.each(args, function (val, arg) {
            if (arg in argValues) {
                if (typeof val === 'undefined' || typeof val === 'null') {
                    util.warn('Setting argument %s to %s', arg, val);
                }

                argValues[arg] = {dirty: true, val: val};
            } else if (arg in defValues) {
                if (val !== defValues[arg]) {
                    mustRecompile = true;
                }
                defValues[arg] = {dirty: true, val: val};
            } else {
                util.die('Kernel %s has no argument/define named %s', name, arg);
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
            return argValues[arg].val
        } else {
            util.warn('Kernel %s has no parameter %s', name, arg);
            return undefined;
        }
    }

    function compile () {
        debug('Compiling kernel', that.name);

        _.each(defValues, function (arg, wrappedVal) {
            if (wrappedVal.val === null)
                util.die('Define %s of kernel %s was never set', arg, name);
        });

        var prefix = _.flatten(_.map(defValues, function (wrappedVal, key) {
            var val = wrappedVal && wrappedVal.val;
            if (typeof val === 'string' || typeof val === 'number' || val === true) {
                return ['#define ' + key + ' ' + val];
            } else if (val === null) {
                return ['#define ' + key];
            } else {
                return [];
            }
        })).join('\n');
        debug('Prefix', prefix);

        return source.then(function (source) {
            var processedSource = prefix + '\n\n' + source;
            if (debug.enabled && config.ENVIRONMENT === 'local') {
                var debugFile = path.resolve(__dirname, '..', 'kernels', 'debug.' + file);
                fs.writeFileSync(debugFile, processedSource);
            }

            return clContext.compile(processedSource, [name])
                .then(function (kernels) {
                    return kernels[name];
                });
        });
    };

    function setAllArgs(kernel) {
        debug('Setting arguments for kernel', name)
        var i;
        try {
            for (i = 0; i < args.length; i++) {
                var arg = args[i];
                var val = argValues[arg].val;
                var dirty = argValues[arg].dirty;
                var type = argTypes[arg];
                if (val === null)
                    util.warn('In kernel %s, argument %s is null', name, arg);

                if (dirty) {
                    debug('Setting arg %d with value', i, val);
                    kernel.setArg(i, val, type || undefined);
                    argValues[arg].dirty = false;
                }
            }

        } catch (e) {
            util.makeErrorHandler('Error setting argument %s of kernel %s', args[i], name)(e);
        }
    };

    function call(kernel, workItems, buffers, workGroupSize) {
        return cljs.acquire(buffers)
            .then(function () {
                var queue = clContext.queue;
                debug('Enqueuing kernel %s', that.name, kernel);
                var start = process.hrtime();
                queue.enqueueNDRangeKernel(kernel, null, workItems, workGroupSize || null);
                return start;
            }).fail(
                util.makeErrorHandler('Kernel %s error', that.name)
            ).then(function (start) {
                if (synchronous) {
                    debug('Waiting for kernel to finish');
                    clContext.queue.finish();
                    var diff = process.hrtime(start);
                    that.timings[that.totalRuns % maxTimings] = (diff[0] * 1000 + diff[1] / 1000000);
                }
                that.totalRuns++;
                return cljs.release(buffers);
            }).then(_.constant(that));
    }

    // [Int] * [String] -> Promise[Kernel]
    this.exec = function(numWorkItems, resources, workGroupSize) {
        return qKernel.then(function (kernel) {
            if (kernel === null) {
                util.error('Kernel is not compiled, aborting');
                return Q();
            } else {
                setAllArgs(kernel);
                return call(kernel, numWorkItems, resources, workGroupSize);
            }
        });
    }
}

// () -> Stats
Kernel.prototype.runtimeStats = function () {
    var runs = this.timings.length;
    var mean =  _.reduce(this.timings, function (a, b) {return a + b;}, 0) / runs;
    var stdDev =
        _.reduce(this.timings, function (acc, t) {
            return acc + (t - mean) * (t - mean);
        }, 0) / (runs > 1 ? runs - 1 : runs);

    var pretty = sprintf('%25s:%4s ±%4s        #runs:%4d', this.name,
                         mean.toFixed(0), stdDev.toFixed(0), this.totalRuns);
    return {
        name: this.name,
        runs: this.totalRuns,
        mean: mean,
        stdDev: stdDev,
        pretty: pretty
    }
}

module.exports = Kernel;

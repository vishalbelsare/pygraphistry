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
    var synchronous = true;

    // For gathering performance data
    this.timings = [];
    this.totalRuns = 0;
    var maxTimings = 100

    // Sanity Checks
    _.each(argNames, function (arg) {
        if (!(arg in argTypes))
            utiljs.die('In Kernel %s, argument %s has no type', name, arg);
    });

    function isDefine(arg) {
        return argTypes[arg] === cljs.types.define;
    };
    var args = _.reject(argNames, isDefine);
    var defines = _.filter(argNames, isDefine).concat(['NODECL']);

    var argValues = _.object(
        _.map(args, function (name) { return [name, null]; })
    );
    var defValues = _.object(
        _.map(defines, function (name) { return [name, null]; })
    );
    Object.seal(argValues);
    Object.seal(defValues);

    // If kernel has no defines, compile right away
    var clKernel = _.without(defines, 'NODECL').length === 0 ? compile() : Q(null);

    // {String -> Value} -> Kernel
    this.set = function (args) {
        debug('Setting args for kernel', this.name);

        var mustRecompile = false;
        _.each(args, function (val, arg) {
            if (arg in argValues) {
                argValues[arg] = (typeof val === 'number') ? [val] : val;
            } else if (arg in defValues) {
                if (val !== defValues[arg]) {
                    mustRecompile = true;
                }
                defValues[arg] = val;
            } else {
                util.die('Kernel %s has no argument/define named %s', name, arg);
            }
        });

        if (mustRecompile) {
            clKernel = compile();
        }

        return this;
    };

    function compile () {
        debug('Compiling kernel', that.name);

        _.each(defValues, function (arg, val) {
            if (val === null)
                util.die('Define %s of kernel %s was never set', arg, name);
        });

        var prefix = _.flatten(_.map(defValues, function (val, key) {
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

    function setAllArgs(clKernel) {
        debug('Setting arguments for kernel', name)
        var i;
        try {
            for (i = 0; i < args.length; i++) {
                var arg = args[i];
                var val = argValues[arg];
                var type = argTypes[arg];
                debug('Setting no %d named %s of type %s with value %o', i, arg, type, val);
                if (val === null)
                    console.warn("WARNING In kernel %s, argument %s is null", name, arg);

                clKernel.setArg(i, val.length ? val[0] : val, type || undefined);
            }

        } catch (e) {
            console.error('Error setting argument %s of kernel %s', args[i], name);
            throw new Error(e);
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
            }).catch (function(error) {
                console.error('Kernel %s error', that.name, error);
            }).then(function (start) {
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
        return clKernel.then(function (kernel) {
            if (kernel === null) {
                console.error('Kernel is not compiled, aborting');
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

    var pretty = sprintf('%25s:%4s ±%4s    #runs:%4d', this.name,
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

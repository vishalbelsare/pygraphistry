'use strict';

var _ = require('underscore');
var Q = require('q');
var debug = require("debug")("graphistry:graph-viz:cl:kernel");
var sprintf = require("sprintf-js").sprintf;
var util = require('./util');
var cljs = require('./cl.js');


// String * [String] * {String: Type} * String * clCtx
var Kernel = function (name, argNames, argTypes, file, clContext) {
    var that = this;
    this.name = name;
    this.argNames = argNames;
    var source = util.getKernelSource(file);
    var mustRecompile = true;
    var clKernel = null;
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

    // {String -> Value} -> Kernel
    this.set = function (args) {
        _.each(args, function (val, arg) {
            if (arg in argValues) {
                argValues[arg] = (typeof val === 'number') ? [val] : val;
            } else if (arg in defValues) {
                if (val !== defValues[arg])
                    mustRecompile = true;
                defValues[arg] = val;
            } else {
                util.die('Kernel %s has no argument/define named %s', name, arg);
            }
        });

        return this;
    };

    function compile () {
        _.each(defValues, function (arg, val) {
            if (val === null)
                util.die('Define %s of kernel %s was never set', arg, name);
        })
        return clContext.compile(source, [name], defValues)
            .then(function (wrappedKernel) {
                return wrappedKernel[name].kernel;
            });
    };

    function setAllArgs() {
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

    function call(WorkItems, buffers) {
        return cljs.acquire(buffers)
            .then(function () {
                var queue = clContext.queue;
                debug('Enqueuing kernel %s', that.name);
                var start = process.hrtime();
                queue.enqueueNDRangeKernel(clKernel, null, WorkItems, null);
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
    this.exec = function(numWorkItems, resources) {
        return Q().then(function () {
            if (mustRecompile) {
                mustRecompile = false;
                return compile();
            } else {
                return clKernel;
            }
        }).then(function (k) {
            debug('Kernel', k)
            clKernel = k;
            setAllArgs();
            return call(numWorkItems, resources);
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

    var pretty = sprintf('%25s:%4s ± %03s    #runs:%d', this.name,
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

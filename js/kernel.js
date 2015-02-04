'use strict';

var _ = require('underscore');
var Q = require('q');
var debug = require("debug")("graphistry:graph-viz:cl:kernel");
var util = require('./util');
var cljs = require('./cl.js');


// String * [String] * {String: Type} * string * clCtx
var Kernel = function (name, argNames, argTypes, file) {
    var that = this;
    this.name = name;
    var source = util.getKernelSource(file);
    that.clContext = null;
    var mustRecompile = true;
    var clKernel = null;
    var synchronous = true;

    // Sanity Checks
    _.each(argNames, function (arg) {
        if (!(arg in argTypes))
            utiljs.die('In Kernel %s, argument %s has no type', name, arg);
    });

    function isDefine(arg) {
        return argTypes[arg] === cljs.types.define;
    };
    var args = _.reject(argNames, isDefine);
    var defines = _.filter(argNames, isDefine);

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
                argValues[arg] = val;
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
        return that.clContext.compile(source, [name], defines)
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
                var queue = that.clContext.queue;
                debug('Enqueuing kernel %s', that.name);
                queue.enqueueNDRangeKernel(clKernel, null, WorkItems, null);
            }).catch (function(error) {
                console.error('Kernel %s error', that.name, error);
            }).then(function () {
                if (synchronous) {
                    debug('Waiting for kernel to finish');
                    that.clContext.queue.finish();
                }
                cljs.release(buffers);
            }).then(_.constant(this));
    }

    // Int * [String] -> Promise[Kernel]
    this.exec = function(numWorkItems, resources) {
        return Q().then(function () {
            if (mustRecompile)
                return compile();
            else
                return clKernel;
        }).then(function (k) {
            debug('Kernel', k)
            clKernel = k;
            setAllArgs();
            return call(numWorkItems, resources);
        });
    }
}

module.exports = Kernel;


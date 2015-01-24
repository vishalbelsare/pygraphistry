"use strict";

var Q = require('q');
var events = require('./SimpleEvents.js');
var _ = require('underscore');
var debug = require("debug")("graphistry:graph-viz:cl:cl");
var util = require('util');
var path = require('path');
var utiljs = require('./util.js');


var DEVICE_TYPE = null;

console.debug = console.log;
debug("Initializing node-webcl flavored cl.js");
var webcl = require('node-webcl');
var types = {
    char_t: webcl.type.CHAR,
    double_t: webcl.type.DOUBLE,
    float_t: webcl.type.FLOAT,
    half_t: webcl.type.HALF,
    int_t: webcl.type.INT,
    local_t: webcl.type.LOCAL_MEMORY_SIZE,
    long_t: webcl.type.LONG,
    short_t: webcl.type.SHORT,
    uchar_t: webcl.type.UCHAR,
    uint_t: webcl.type.UINT,
    ulong_t: webcl.type.ULONG,
    ushort_t: webcl.type.USHORT,
    float2_t: webcl.type.VEC2,
    float3_t: webcl.type.VEC3,
    float4_t: webcl.type.VEC4,
    float8_t: webcl.type.VEC8,
    float16_t: webcl.type.VEC16
};


// TODO: in call() and setargs(), we currently requires a `argTypes` argument becuase older WebCL
// versions require us to pass in the type of kernel args. However, current versions do not. We want
// to keep this API as close to the current WebCL spec as possible. Therefore, we should not require
// that argument, even on old versions. Instead, we should query the kernel for the types of each
// argument and fill in that information automatically, when required by old WebCL versions.

var create = Q.promised(function(renderer) {
    return createCLContextNode(renderer);
});

function setKernelArgs(kernels, simulator, kernelName) {
    var kEntry = _.find(kernels, function (k) {return k.name == kernelName});
    if (!kEntry)
        utiljs.die("No kernel named " + kernelName);

    var order = kEntry.order;
    var args = kEntry.args;
    var types = kEntry.types;
    if (order == undefined || args == undefined || types == undefined)
        utiljs.die("kEntry incomplete for kernel %s: %o", kernelName, kEntry);


    debug("Setting Kernel Args for %s %o", kernelName, args)

    if (order.length != Object.keys(args).length) {
        console.error("Order %o", order)
        console.error("Args %o", args)
        utiljs.die("Mismatch between order/args for " + kernelName);
    }

    var argArray = [];
    var typeArray = [];

    for (var i = 0; i < order.length; i++) {
        var arg = order[i];
        var val = args[arg];
        var type = types[arg];

        if (type === undefined)
            utiljs.die("Cannot find type of argument " + arg + " for " + kernelName);
        if (val === null)
            console.warn("WARNING In kernel %s, attribute %s is null", kernelName, arg);
        argArray.push(val);
        typeArray.push(type);
    }

    var kernel = simulator.kernels[kernelName];
    if (!kernel)
        utiljs.die("Simulator has no kernel " + kernelName);

    kernel.setArgs(argArray, typeArray);
}

function createCLContextNode(renderer) {
    if (typeof webcl === "undefined") {
        throw new Error("WebCL does not appear to be supported in your browser");
    } else if (webcl === null) {
        throw new Error("Can't access WebCL object");
    }

    var platforms = webcl.getPlatforms();
    if (platforms.length === 0) {
        throw new Error("Can't find any WebCL platforms");
    }
    debug("Found %d OpenCL platforms; using first", platforms.length);
    var platform = platforms[0];

    var clDevices = platform.getDevices(DEVICE_TYPE);
    debug("Devices found on platform: %d", clDevices.length);
    if(clDevices.length < 1) {
        throw new Error("No WebCL devices of specified type (" + DEVICE_TYPE + ") found")
    }

    var devices = clDevices.map(function(d) {
    // var devices = platform.getDevices(DEVICE_TYPE).map(function(d) {
        debug("Found device %s", util.inspect(d, {depth: null, showHidden: true, colors: true}));

        var typeToString = function (v) {
            return v === 2 ? 'CPU'
                : v === 4 ? 'GPU'
                : v === 8 ? 'ACCELERATOR'
                : ('unknown type: ' + v);
        }

        var computeUnits = d
            .getInfo(webcl.DEVICE_MAX_WORK_ITEM_SIZES)
            .reduce(function(a, b) {
                return a * b;
            });

        return {
            device: d,
            deviceType: typeToString(d.getInfo(webcl.DEVICE_TYPE)),
            computeUnits: computeUnits
        };
    });

    devices.sort(function(a, b) {
        var nameA = a.device.getInfo(webcl.DEVICE_VENDOR);
        var nameB = b.device.getInfo(webcl.DEVICE_VENDOR);
        var vendor = "NVIDIA";
        if (nameA.indexOf(vendor) != -1 && nameB.indexOf(vendor) == -1) {
            return -1;
        } else if (nameB.indexOf(vendor) != -1 && nameA.indexOf(vendor) == -1) {
            return 1;
        } else {
            return b.computeUnits - a.computeUnits;
        }
    });


    var deviceWrapper = null, err = null;

    for (var i = 0; i < devices.length && deviceWrapper === null; i++) {
        var wrapped = devices[i];

        try {
            if(renderer.gl !== null) {
                debug('Device with gl');
                if(wrapped.device.getInfo(webcl.DEVICE_EXTENSIONS).search(/gl.sharing/i) == -1) {
                    debug("Skipping device %d due to no sharing. %o", i, wrapped);
                    continue;
                }

                wrapped.context = webcl.createContext({
                    devices: [ wrapped.device ],
                    shareGroup: renderer.gl,
                    platform: platform
                });
            } else {
                wrapped.context = webcl.createContext({
                    devices: [ wrapped.device ],
                    platform: platform
                });
            }

            if (wrapped.context === null) {
                throw new Error("Error creating WebCL context");
            }

            wrapped.queue = wrapped.context.createCommandQueue(wrapped.device, 0);
            deviceWrapper = wrapped;
        } catch (e) {
            debug("Skipping device %d due to error %o. %o", i, e, wrapped);
            err = e;
        }
    }

    if (deviceWrapper === null) {
        throw (err !== null ? err : new Error("A context could not be created from an available device"));
    }

    debug("Device set. Vendor: %s. Device: %o", deviceWrapper.device.getInfo(webcl.DEVICE_VENDOR), deviceWrapper);
    if (deviceWrapper.deviceType === "CPU")
        console.warn("WARNING using CPU driver for OpenCL");

    var res = {
        renderer: renderer,
        cl: webcl,
        context: deviceWrapper.context,
        device: deviceWrapper.device,
        queue: deviceWrapper.queue,
        maxThreads: deviceWrapper.device.getInfo(webcl.DEVICE_MAX_WORK_GROUP_SIZE),
        numCores: deviceWrapper.device.getInfo(webcl.DEVICE_MAX_COMPUTE_UNITS)
    };

    //FIXME ??
    res.compile = compile.bind(this, res);
    res.createBuffer = createBuffer.bind(this, res);
    res.createBufferGL = createBufferGL.bind(this, res);

    return res;

};


/**
 * Compile the WebCL program source and return the kernel(s) requested
 *
 * @param cl - the cljs instance object
 * @param {string} source - the source code of the WebCL program you wish to compile
 * @param {(string|string[])} kernels - the kernel name(s) you wish to get from the compiled program
 *
 * @returns {(kernel|Object.<string, kernel>)} If kernels was a single kernel name, returns a
 *          single kernel. If kernels was an array of kernel names, returns an object with each
 *          kernel name mapped to its kernel object.
 */
var compile = Q.promised(function (cl, source, kernels) {
    debug("Compiling kernels");
    var program;

    try {
        program = cl.context.createProgram("#define NODECL\n\n" + source);
        var includeDir = path.resolve(__dirname, '..', 'kernels');
        program.build([cl.device], '-I ' + includeDir);
    } catch (e) {
        console.error('OpenCL compilation error:', e.stack);
        var log = program.getBuildInfo(cl.device, webcl.PROGRAM_BUILD_LOG)
        console.error('Build Log: %o', log);
        throw e;
    }

    try {

        var kernelsObjs = typeof kernels === "string" ? [ 'unknown' ] : kernels;

        var compiled = _.object(kernelsObjs.map(function (kernelName) {
                debug('    Compiling ', kernelName);

                var kernelObj = {};

                kernelObj.name = kernelName;
                kernelObj.kernel = program.createKernel(kernelName);
                kernelObj.cl = cl;
                kernelObj.call = call.bind(this, kernelObj);
                kernelObj.setArgs = setArgs.bind(this, kernelObj);

                return [kernelName, kernelObj];
        }));


        debug('  Compiled kernels');

        return typeof kernels === "string" ? compiled.unknown : compiled;

    } catch (e) {
        console.error('Kernel creation error:', kernels, e.stack);
        throw e;
    }
});



var acquire = function (buffers) {
    return Q.all(
        (buffers||[]).map(function (buffer) {
            return buffer.acquire();
        }));
};


var release = function (buffers) {
    return Q.all(
        (buffers||[]).map(function (buffer) {
            return buffer.release();
        }));
};


// Executes the specified kernel, with `threads` number of threads, acquiring/releasing any needed resources
var call = Q.promised(function (kernel, globalSize, buffers, localSize) {
    return acquire(buffers)
        .then(function () {
            var workgroup;
            if (localSize === undefined) {
                workgroup = null;
            } else {
                workgroup = [localSize];
            }
            var global = [globalSize];
            kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, null, global, workgroup);
        })
        .catch (function(error) {
            console.log(error);
        })
        .then(release.bind('', buffers))
        // .then(function () { kernel.cl.queue.finish(); })
        .then(_.constant(kernel));
});


function setArgs(kernel, args, argTypes) {
    argTypes = argTypes || [];

    var i;
    try {
        for (i = 0; i < args.length; i++) {
            if(args[i] !== null) {
                kernel.kernel.setArg(i, args[i].length ? args[i][0] : args[i], argTypes[i] || undefined);
            }
        }
    } catch (e) {
        console.error('Error setting kernel args::', kernel.name, '::arg ', i, '::', e, e.stack);
        console.error('args', args);
        console.error('types', argTypes);
        console.error('arg/type', args ? args[i] : 'no args', argTypes ? argTypes[i] : 'no types');
        throw new Error(e);
    }

    debug('Set kernel args');
    return kernel;
};


var createBuffer = Q.promised(function(cl, size, name) {
    debug("Creating buffer %s, size %d", name, size);

    var buffer = cl.context.createBuffer(cl.cl.MEM_READ_WRITE, size);

    if (buffer === null) {
        throw new Error("Could not create the WebCL buffer");
    }

    var bufObj = {
        "name": name,
        "buffer": buffer,
        "cl": cl,
        "size": size,
        "acquire": function() {
            return Q();
        },
        "release": function() {
            return Q();
        }
    };
    bufObj.delete = Q.promised(function() {
        buffer.release();
        bufObj.size = 0;
        return null;
    });
    bufObj.write = write.bind(this, bufObj);
    bufObj.read = read.bind(this, bufObj);
    bufObj.copyInto = copyBuffer.bind(this, cl, bufObj);
    return bufObj;
});


// TODO: If we call buffer.acquire() twice without calling buffer.release(), it should have no
// effect.
function createBufferGL(cl, vbo, name) {
    debug("Creating buffer %s from GL buffer", name);

    if(vbo.gl === null) {
        debug("    GL not enabled; falling back to creating CL buffer");
        return createBuffer(cl, vbo.len, name)
            .then(function(bufObj) {
                if(vbo.data !== null) {
                    return bufObj.write(vbo.data);
                } else {
                    return bufObj;
                }
            })
            .then(function(bufObj) {
                // Delete reference to data once we've written it, so we don't leak memory
                bufObj.data = null;
                return bufObj;
            });
    }

    var deferred = Q.defer();

    var buffer = cl.context.createFromGLBuffer(cl.cl.MEM_READ_WRITE, vbo.buffer);

    if (buffer === null) {
        deferred.reject(new Error("Could not create WebCL buffer from WebGL buffer"))
    } else {
        if (!buffer.getInfo) { debug("WARNING: no getInfo() available on buffer %s", name); }

        var bufObj = {
            "name": name,
            "buffer": buffer,
            "cl": cl,
            "size": buffer.getInfo ? buffer.getInfo(cl.cl.MEM_SIZE) : vbo.len,
            "acquire": Q.promised(function() {
                cl.renderer.finish();
                cl.queue.enqueueAcquireGLObjects([buffer]);

            }),
            "release": Q.promised(function() {
                cl.queue.enqueueReleaseGLObjects([buffer]);
                cl.queue.finish();
                cl.renderer.finish();
            })
        };

        bufObj.delete = Q.promised(function() {
            return bufObj.release()
            .then(function() {
                bufObj.release();
                bufObj.size = 0;
                return null;
            });
        });

        bufObj.write = write.bind(this, bufObj);
        bufObj.read = read.bind(this, bufObj);
        bufObj.copyInto = copyBuffer.bind(this, cl, bufObj);

        debug("  Created buffer");
        deferred.resolve(bufObj)
    }

    return deferred.promise;
}


var copyBuffer = Q.promised(function (cl, source, destination) {
    debug("Copying buffer. Source: %s (%d bytes), destination %s (%d bytes)",
        source.name, source.size, destination.name, destination.size);
    return acquire([source, destination])
        .then(function () {
            cl.queue.enqueueCopyBuffer(source.buffer, destination.buffer, 0, 0, Math.min(source.size, destination.size));
        })
        // .then(function () {
        //     cl.queue.finish();
        // })
        .then(release.bind(null, [source, destination]));
});


var write = Q.promised(function write(buffer, data) {
    debug('Writing to buffer', buffer.name, buffer.size, 'bytes');
    return buffer.acquire()
        .then(function () {
            buffer.cl.queue.enqueueWriteBuffer(buffer.buffer, true, 0, data.byteLength, data);
            return buffer.release();
        })
        .then(function() {
            // buffer.cl.queue.finish();
            debug("  Finished buffer %s write", buffer.name);
            return buffer;
        });
});


var read = Q.promised(function (buffer, target, optStartIdx, optLen) {
    return buffer.acquire()
        .then(function() {
            var start = Math.min(optStartIdx || 0, buffer.size);
            var len = optLen !== undefined ? optLen : (buffer.size - start);
            buffer.cl.queue.enqueueReadBuffer(buffer.buffer, true, start, len, target);
            return buffer.release();
        })
        .then(function() {
            return buffer;
        },
        function(err) {
            console.error("Read error for buffer " + buffer.name + ":", err);
        });
});



DEVICE_TYPE = webcl.DEVICE_TYPE_ALL;


module.exports = {
    "acquire": acquire,
    "call": call,
    "compile": compile,
    "create": create,
    "createBuffer": createBuffer,
    "createBufferGL": createBufferGL,
    "release": release,
    "setArgs": setArgs,
    "setKernelArgs": setKernelArgs,
    "types": types,
    "write": write,
    "read": read
};

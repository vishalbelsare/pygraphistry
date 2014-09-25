"use strict";

var Q = require('q');
var events = require('./SimpleEvents.js');
var _ = require('underscore');
var debug = require("debug")("N-body:cl");
var util = require('util');

if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
    console.debug = console.log;
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

var DEVICE_TYPE = webcl.DEVICE_TYPE_GPU;


var getClContext;
if (typeof(window) == 'undefined') {
    debug("Initializing node-webcl flavored cl.js functions");


    var createContext = function(webcl, gl, platform, devices) {
        return webcl.createContext({
            devices: devices,
            shareGroup: gl,
            platform: platform
        });
    };


    var createCL = function(webcl, gl) {
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

        debug("Devices found on platform: %d", platform.getDevices(DEVICE_TYPE).length);
        var devices = platform.getDevices(DEVICE_TYPE).map(function(d) {
            debug("Found device %s", util.inspect(d, {depth: null, showHidden: true, colors: true}));
            var workItems = d.getInfo(webcl.DEVICE_MAX_WORK_ITEM_SIZES);
            return {
                device: d,
                computeUnits: workItems.reduce(function(a, b) {
                    return a * b;
                })
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
        var deviceWrapper;
        var err = devices.length ? null : new Error("No WebCL devices of specified type (" + DEVICE_TYPE + ") found");
        for (var i = 0; i < devices.length; i++) {
            var wrapped = devices[i];
            try {
                if (wrapped.device.getInfo(webcl.DEVICE_EXTENSIONS).search(/gl.sharing/i) == -1) {
                    debug("Skipping device %d due to no sharing. %o", i, wrapped);
                    continue;
                }
                wrapped.context = createContext(webcl, gl, platform, [ wrapped.device ]);
                if (wrapped.context === null) {
                    throw new Error("Error creating WebCL context");
                }
                wrapped.queue = wrapped.context.createCommandQueue(wrapped.device, 0);
            } catch (e) {
                debug("Skipping device %d due to error %o. %o", i, e, wrapped);
                err = e;
                continue;
            }
            deviceWrapper = wrapped;
            break;
        }
        if (!deviceWrapper) {
            throw err;
        }
        debug("Device set. Vendor: %s. Device: %o", deviceWrapper.device.getInfo(webcl.DEVICE_VENDOR), deviceWrapper);

        var res = {
            gl: gl,
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
    getClContext = function (gl) {
        return createCL(webcl, gl);
    };
} else {
    getClContext = function (gl) {
        if (typeof(webcl) === "undefined") {
            throw new Error("WebCL does not appear to be supported in your browser");
        }

        var cl = webcl;
        if (cl === null) {
            throw new Error("Can't access WebCL object");
        }

        var platforms = cl.getPlatforms();
        if (platforms.length === 0) {
            throw new Error("Can't find any WebCL platforms");
        }
        var platform = platforms[0];

        //sort by number of compute units and use first non-failing device
        var devices = platform.getDevices(DEVICE_TYPE).map(function (d) {

            function typeToString (v) {
                return v === 2 ? 'CPU'
                    : v === 4 ? 'GPU'
                    : v === 8 ? 'ACCELERATOR'
                    : ('unknown type: ' + v);
            }

            var workItems = d.getInfo(cl.DEVICE_MAX_WORK_ITEM_SIZES);

            return {
                device: d,
                DEVICE_TYPE: typeToString(d.getInfo(cl.DEVICE_TYPE)),
                DEVICE_MAX_WORK_ITEM_SIZES: workItems,
                computeUnits: [].slice.call(workItems, 0).reduce(function (a, b) { return a * b; })
            };
        });
        devices.sort(function (a, b) { return b.computeUnits - a.computeUnits; });

        var deviceWrapper;
        var err = devices.length ?
            null : new Error("No WebCL devices of specified type (" + DEVICE_TYPE + ") found");
        for (var i = 0; i < devices.length; i++) {
            var wrapped = devices[i];
            try {
                wrapped.context = _createContext(cl, gl, platform, [wrapped.device]);
                if (wrapped.context === null) {
                    throw new Error("Error creating WebCL context");
                }
                wrapped.device.enableExtension("KHR_gl_sharing");
                wrapped.queue = wrapped.context.createCommandQueue(wrapped.device);
            } catch (e) {
                debug("Skipping device %d due to error %o. %o", i, e, wrapped);
                err = e;
                continue;
            }
            deviceWrapper = wrapped;
            break;
        }
        if (!deviceWrapper) {
            throw err;
        }

        debug("Device set. Device: %o", deviceWrapper);

        var clObj = {
            "gl": gl,
            "cl": cl,
            "context": deviceWrapper.context,
            "device": deviceWrapper.device,
            "queue": deviceWrapper.queue,
            "maxThreads": deviceWrapper.device.getInfo(cl.DEVICE_MAX_WORK_GROUP_SIZE),
            "numCores": deviceWrapper.device.getInfo(cl.DEVICE_MAX_COMPUTE_UNITS)
        };

        clObj.compile = compile.bind(this, clObj);
        clObj.createBuffer = createBuffer.bind(this, clObj);
        clObj.createBufferGL = createBufferGL.bind(this, clObj);

        return clObj;
    };
}






// TODO: in call() and setargs(), we currently requires a `argTypes` argument becuase older WebCL
// versions require us to pass in the type of kernel args. However, current versions do not. We want
// to keep this API as close to the current WebCL spec as possible. Therefore, we should not require
// that argument, even on old versions. Instead, we should query the kernel for the types of each
// argument and fill in that information automatically, when required by old WebCL versions.

var create = Q.promised(getClContext);


// This is a separate function from create() in order to allow polyfill() to override it on
// older WebCL platforms, which have a different way of creating a context and enabling CL-GL
// sharing.
var _createContext = function(cl, gl, platform, devices) {
    cl.enableExtension("KHR_gl_sharing");
    return cl.createContext(gl, devices);
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
    var t0 = new Date().getTime();
    debug("Compiling kernels");

    try {
        var program = cl.context.createProgram("#define NODECL\n\n" + source);
        program.build([cl.device]);

        if (typeof kernels === "string") {

            debug('    Compiling unknown kernel');

            var kernelObj = {};
            kernelObj.name = undefined;
            kernelObj.kernel = program.createKernel(kernels);
            kernelObj.cl = cl;
            kernelObj.call = call.bind(this, kernelObj);
            kernelObj.setArgs = setArgs.bind(this, kernelObj);

            return kernelObj;
        } else {
            var kernelObjs = {};

            for(var i = 0; i < kernels.length; i++) {
                var kernelName = kernels[i];
                var kernelObj = {};

                debug('    Compiling ', kernelName);


                kernelObj.name = kernelName;
                kernelObj.kernel = program.createKernel(kernelName);
                kernelObj.cl = cl;
                kernelObj.call = call.bind(this, kernelObj);
                kernelObj.setArgs = setArgs.bind(this, kernelObj);

                kernelObjs[kernelName] = kernelObj;
            }

            debug('  Compiled kernels in %d ms.', new Date().getTime() - t0);

            return kernelObjs;
        }
    } catch (e) {
        console.error('Kernel compilation error:', e.stack);
        console.error(kernels);
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
var call = Q.promised(function (kernel, threads, buffers) {
    return acquire(buffers)
        .then(function () {
            var workgroupSize = new Int32Array([threads]);
            kernel.cl.queue.enqueueNDRangeKernel(
                kernel.kernel,
                workgroupSize.length,
                [],
                workgroupSize,
                []);
        })
        .then(release.bind('', buffers))
        .then(function () {
            kernel.cl.queue.finish();
        }).then(_.constant(kernel));
});


var setArgs = function (kernel, args, argTypes) {
    var t0 = new Date().getTime();
    for (var i = 0; i < args.length; i++) {
        if(args[i] !== null) {
            kernel.kernel.setArg(i, args[i]);
        }
    }
    debug('Set kernel args (%d ms)', new Date().getTime() - t0);
    return kernel;
};


var createBuffer = Q.promised(function createBuffer(cl, size, name) {
    debug("Creating buffer %s", name);

    var buffer = cl.context.createBuffer(cl.cl.MEM_READ_WRITE, size);
    if (buffer === null) {
        throw new Error("Could not create the WebCL buffer");
    } else {
        var bufObj = {
            "name": name,
            "buffer": buffer,
            "cl": cl,
            "size": size,
            "acquire": function() {
                return Q(); },
            "release": function() {
                return Q(); }
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
    }
});


// TODO: If we call buffer.acquire() twice without calling buffer.release(), it should have no
// effect.
var createBufferGL = Q.promised(function (cl, vbo, name) {

    var t0 = new Date().getTime();

    debug("Creating buffer %s from GL buffer", name);

    var buffer = cl.context.createFromGLBuffer(cl.cl.MEM_READ_WRITE, vbo.buffer);
    if (buffer === null) {
        throw new Error("Could not create WebCL buffer from WebGL buffer");
    } else {
        if (!buffer.getInfo) {
            debug("WARNING: no getInfo() available on buffer %s", name);
        }
        var bufObj = {
            "name": name,
            "buffer": buffer,
            "cl": cl,
            "size": buffer.getInfo ? buffer.getInfo(cl.cl.MEM_SIZE) : vbo.len,
            "acquire": Q.promised(function() {
                cl.gl.finish();
                cl.queue.enqueueAcquireGLObjects([buffer]);

            }),
            "release": Q.promised(function() {
                cl.queue.enqueueReleaseGLObjects([buffer]);
                cl.queue.finish();
                cl.gl.finish();
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

        debug("  Created buffer in %d ms", new Date().getTime() - t0);

        return bufObj;
    }
});


var copyBuffer = Q.promised(function (cl, source, destination) {
    debug("Copying buffer. Source: %s (%d bytes), destination %s (%d bytes)",
        source.name, source.size, destination.name, destination.size);
    return acquire([source, destination])
        .then(function () {
            cl.queue.enqueueCopyBuffer(source.buffer, destination.buffer, 0, 0, Math.min(source.size, destination.size));
        })
        .then(function () {
            cl.queue.finish();
        })
        .then(release.bind(null, [source, destination]));
});


var write = Q.promised(function write(buffer, data) {
    debug("Writing to buffer %s", buffer.name);
    var t0 = new Date().getTime();
    return buffer.acquire()
        .then(function () {
            buffer.cl.queue.enqueueWriteBuffer(buffer.buffer, true, 0, data.byteLength, data);
            return buffer.release();
        })
        .then(function() {
            buffer.cl.queue.finish();
            debug("  Finished buffer %s write in %d ms", buffer.name, new Date().getTime() - t0);
            return buffer;
        });
});


var read = Q.promised(function (buffer, target) {
    return buffer.acquire()
        .then(function() {
            var copySize = Math.min(buffer.size, target.length * target.BYTES_PER_ELEMENT);
            buffer.cl.queue.enqueueReadBuffer(buffer.buffer, true, 0, copySize, target);
            return buffer.release();
        })
        .then(function() {
            return buffer;
        },
        function(err) {
            console.error("Read error for buffer " + buffer.name + ":", err);
        });
});


// Detects the WebCL platform we're running on, and modifies this module as needed.
// Returns true if the the platform is out-of-date and needed to be polyfilled, and false if
// the platform is up-to-date and no modification was needed.
function polyfill() {
    // Detect if we're running on a current WebCL version
    if(typeof(window) != 'undefined' && typeof webcl.enableExtension == "function") {
        // If so, don't do anything
        return false;
    }

    debug("Detected old WebCL platform. Modifying functions to support it.");


    _createContext = function(cl, gl, platform, devices) {
        if (webcl.type) {
            return webcl.createContext({
                devices: devices,
                shareGroup: gl,
                platform: platform});
        } else {
            var extension = cl.getExtension("KHR_GL_SHARING");
            if (extension === null) {
                throw new Error("Could not create a shared CL/GL context using the WebCL extension system");
            }
            return extension.createContext({
                platform: platform,
                devices: devices,
                deviceType: DEVICE_TYPE,
                sharedContext: null
            });
        }

    }


    call = Q.promised(function (kernel, threads, buffers) {
        //kernel.cl.queue.finish();

        return acquire(buffers)
            .then(function () {

                var workgroupSize = typeof(window) == 'undefined' ? [threads] : new Int32Array([threads]);
                if (webcl.type) {
                    kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, null, [threads], null);
                } else {
                    kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, null, workgroupSize, null);
                }
                return release(buffers);
            })
            .then(function () {
                kernel.cl.queue.finish();
                return kernel;
            });
    });

    setArgs = function (kernel, args, argTypes) {
        argTypes = argTypes || [];
        var t0 = new Date().getTime();
        try {
            for (var i = 0; i < args.length; i++) {
                if (args[i]) {
                    kernel.kernel.setArg(i, args[i].length ? args[i][0] : args[i], argTypes[i] || undefined);
                }
            }
        } catch (e) {
            console.error('Error setting kernel args (in polyfilled setArgs())::', kernel.name, '::', e, e.stack);
            throw new Error(e);
        }
        return kernel;
    };

    if (typeof WebCLKernelArgumentTypes == 'undefined') {
        var WebCLKernelArgumentTypes = webcl.type;
    }

    types = {
        char_t: WebCLKernelArgumentTypes.CHAR,
        double_t: WebCLKernelArgumentTypes.DOUBLE,
        float_t: WebCLKernelArgumentTypes.FLOAT,
        half_t: WebCLKernelArgumentTypes.HALF,
        int_t: WebCLKernelArgumentTypes.INT,
        local_t: WebCLKernelArgumentTypes.LOCAL_MEMORY_SIZE,
        long_t: WebCLKernelArgumentTypes.LONG,
        short_t: WebCLKernelArgumentTypes.SHORT,
        uchar_t: WebCLKernelArgumentTypes.UCHAR,
        uint_t: WebCLKernelArgumentTypes.UINT,
        ulong_t: WebCLKernelArgumentTypes.ULONG,
        ushort_t: WebCLKernelArgumentTypes.USHORT,
        float2_t: WebCLKernelArgumentTypes.VEC2,
        float3_t: WebCLKernelArgumentTypes.VEC3,
        float4_t: WebCLKernelArgumentTypes.VEC4,
        float8_t: WebCLKernelArgumentTypes.VEC8,
        float16_t: WebCLKernelArgumentTypes.VEC16
    };

    return true;
}
var types = {};
var CURRENT_CL = !polyfill();



module.exports = {
    "acquire": acquire,
    "call": call,
    "compile": compile,
    "create": create,
    "createBuffer": createBuffer,
    "createBufferGL": createBufferGL,
    "release": release,
    "setArgs": setArgs,
    "types": types,
    "write": write,
    "CURRENT_CL": CURRENT_CL
};

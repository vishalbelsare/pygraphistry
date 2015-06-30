"use strict";

var Q = require('q');
var _ = require('underscore');
var nodeutil = require('util');
var path = require('path');
var util = require('./util.js');

var Log         = require('common/logger.js');
var logger      = Log.createLogger('graph-viz:cl:cl');

var perf        = require('common/perfStats.js').createPerfMonitor();

logger.trace("Initializing node-webcl flavored cl.js");
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
    float16_t: webcl.type.VEC16,
    define: '#define',
};

var defaultVendor = 'nvidia';

var clDeviceType = {
    'cpu': webcl.DEVICE_TYPE_CPU,
    'gpu': webcl.DEVICE_TYPE_GPU,
    'all': webcl.DEVICE_TYPE_ALL,
    'any': webcl.DEVICE_TYPE_ALL,
    'default': webcl.DEVICE_TYPE_ALL
};


// TODO: in call() and setargs(), we currently requires a `argTypes` argument becuase older WebCL
// versions require us to pass in the type of kernel args. However, current versions do not. We want
// to keep this API as close to the current WebCL spec as possible. Therefore, we should not require
// that argument, even on old versions. Instead, we should query the kernel for the types of each
// argument and fill in that information automatically, when required by old WebCL versions.

var create = Q.promised(function(renderer, device, vendor) {
    vendor = vendor || 'default';
    device = device || 'all';
    var clDevice = clDeviceType[device.toLowerCase()];
    if (!clDevice) {
        logger.warn('Unknown device %s, using "all"', device);
        clDevice = clDeviceType.all;
    }
    return createCLContextNode(renderer, clDevice, vendor.toLowerCase());
});


function createCLContextNode(renderer, DEVICE_TYPE, vendor) {
    if (typeof webcl === "undefined") {
        throw new Error("WebCL does not appear to be supported in your browser");
    } else if (webcl === null) {
        throw new Error("Can't access WebCL object");
    }

    var platforms = webcl.getPlatforms();
    if (platforms.length === 0) {
        throw new Error("Can't find any WebCL platforms");
    }
    logger.debug("Found %d OpenCL platforms; using first", platforms.length);
    var platform = platforms[0];

    var clDevices = platform.getDevices(DEVICE_TYPE);

    logger.debug("Devices found on platform: %d", clDevices.length);
    if(clDevices.length < 1) {
        throw new Error("No WebCL devices of specified type (" + DEVICE_TYPE + ") found")
    }

    var devices = clDevices.map(function(d) {
    // var devices = platform.getDevices(DEVICE_TYPE).map(function(d) {
        logger.trace("Found device %s", nodeutil.inspect(d, {depth: null, showHidden: true, colors: true}));

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

    if (vendor === 'default') {
        vendor = defaultVendor;
    }

    devices.sort(function(a, b) {
        var nameA = a.device.getInfo(webcl.DEVICE_VENDOR).toLowerCase();
        var nameB = b.device.getInfo(webcl.DEVICE_VENDOR).toLowerCase();

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
                logger.trace('Device with gl');
                if(wrapped.device.getInfo(webcl.DEVICE_EXTENSIONS).search(/gl.sharing/i) == -1) {
                    logger.trace("Skipping device %d due to no sharing. %o", i, wrapped);
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
            logger.trace("Skipping device %d due to error %o. %o", i, e, wrapped);
            err = e;
        }
    }

    if (deviceWrapper === null) {
        throw (err !== null ? err : new Error("A context could not be created from an available device"));
    }

    var attribs = [
        'NAME', 'VENDOR', 'VERSION', 'PROFILE', 'PLATFORM',
        'MAX_WORK_GROUP_SIZE', 'MAX_WORK_ITEM_SIZES', 'MAX_MEM_ALLOC_SIZE',
        'GLOBAL_MEM_SIZE', 'LOCAL_MEM_SIZE','MAX_CONSTANT_BUFFER_SIZE',
        'MAX_CONSTANT_BUFFER_SIZE', 'PROFILE', 'PROFILING_TIMER_RESOLUTION'
    ];

    var props = _.object(attribs.map(function (name) {
        return [name, deviceWrapper.device.getInfo(webcl['DEVICE_' + name])];
    }));
    props.TYPE = deviceWrapper.deviceType;

    logger.info('OpenCL    Type:%s  Vendor:%s  Device:%s',
                props.TYPE, props.VENDOR, props.NAME);

    logger.trace('Device Sizes   WorkGroup:%d  WorkItem:%s', props.MAX_WORK_GROUP_SIZE,
         props.MAX_WORK_ITEM_SIZES);
    logger.trace('Max Mem (kB)   Global:%d  Alloc:%d  Local:%d  Constant:%d',
          props.GLOBAL_MEM_SIZE / 1024, props.MAX_MEM_ALLOC_SIZE / 1024,
          props.LOCAL_MEM_SIZE / 1024, props.MAX_CONSTANT_BUFFER_SIZE / 1024);
    logger.trace('Profile (ns)   Type:%s  Resolution:%d',
         props.PROFILE, props.PROFILING_TIMER_RESOLUTION);

    var res = {
        renderer: renderer,
        cl: webcl,
        context: deviceWrapper.context,
        device: deviceWrapper.device,
        queue: deviceWrapper.queue,
        deviceProps: props,
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
    perf.startTiming('graph-viz:cl:compilekernel');

    logger.trace('Kernel: ', kernels[0]);
    logger.trace('Compiling kernels');

    var program;
    try {
        program = cl.context.createProgram(source);
        // Note: Include dir is not official webcl, won't work in the browser.
        var includeDir = path.resolve(__dirname, '..', 'kernels');
        program.build([cl.device], '-I ' + includeDir + ' -cl-fast-relaxed-math');
    } catch (e) {
        try {
        var buildLog = program.getBuildInfo(cl.device, webcl.PROGRAM_BUILD_LOG)
        Log.makeQErrorHandler(logger, 'OpenCL compilation error')(buildLog);
        } catch (e2) {
        Log.makeQErrorHandler(logger, 'OpenCL compilation failed, no build log possible')(e2);
        }
    }

    try {

        var kernelsObjs = typeof kernels === "string" ? [ 'unknown' ] : kernels;

        var compiled = _.object(kernelsObjs.map(function (kernelName) {
                logger.trace('    Compiling ', kernelName);
                return [kernelName, program.createKernel(kernelName)];
        }));


        logger.trace('  Compiled kernels');

        perf.endTiming('graph-viz:cl:compilekernel', true);
        return typeof kernels === "string" ? compiled.unknown : compiled;

    } catch (e) {
        perf.endTiming('graph-viz:cl:compilekernel');
        Log.makeQErrorHandler(logger, 'Kernel creation error:', kernels)(e);
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
        .fail(Log.makeQErrorHandler(logger, 'Kernel error'))
        .then(release.bind('', buffers))
        .then(function () { kernel.cl.queue.finish(); })
        .then(_.constant(kernel));
});


var createBuffer = Q.promised(function(cl, size, name) {
    logger.debug("Creating buffer %s, size %d", name, size);

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
    logger.debug("Creating buffer %s from GL buffer", name);

    if(vbo.gl === null) {
        logger.debug("GL not enabled; falling back to creating CL buffer");
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
        if (!buffer.getInfo) { logger.debug("WARNING: no getInfo() available on buffer %s", name); }

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

        logger.trace("Created buffer");
        deferred.resolve(bufObj)
    }

    return deferred.promise;
}


var copyBuffer = Q.promised(function (cl, source, destination) {
    logger.debug("Copying buffer. Source: %s (%d bytes), destination %s (%d bytes)",
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
    logger.debug('Writing to buffer', buffer.name, buffer.size, 'bytes');
    return buffer.acquire()
        .then(function () {
            buffer.cl.queue.enqueueWriteBuffer(buffer.buffer, true, 0, data.byteLength, data);
            return buffer.release();
        })
        .then(function() {
            // buffer.cl.queue.finish();
            logger.debug("Finished buffer %s write", buffer.name);
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
        })
        .fail(Log.makeQErrorHandler(logger, 'Read error for buffer', buffer.name));
});


module.exports = {
    "acquire": acquire,
    "call": call,
    "compile": compile,
    "create": create,
    "createBuffer": createBuffer,
    "createBufferGL": createBufferGL,
    "release": release,
    "types": types,
    "write": write,
    "read": read
};

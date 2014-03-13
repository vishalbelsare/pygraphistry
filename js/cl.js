// TODO: in call() and setargs(), we currently requires a `argTypes` argument becuase older WebCL
// versions require us to pass in the type of kernel args. However, current versions do not. We want
// to keep this API as close to the current WebCL spec as possible. Therefore, we should not require
// that argument, even on old versions. Instead, we should query the kernel for the types of each
// argument and fill in that information automatically, when required by old WebCL versions.

define(["Q"], function (Q) {
    'use strict';

	var create = Q.promised(function create (gl) {
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
        var devices = platform.getDevices(cl.DEVICE_TYPE_ALL).map(function (d) {

            function typeToString (v) {
                return v == 2 ? 'CPU'
                    : v == 4 ? 'GPU'
                    : v == 8 ? 'ACCELERATOR'
                    : ('unknown type: ' + v);
            }

            var workItems = d.getInfo(cl.DEVICE_MAX_WORK_ITEM_SIZES);

            return {
                device: d,
                DEVICE_TYPE: typeToString(d.getInfo(cl.DEVICE_TYPE)),
                DEVICE_MAX_WORK_ITEM_SIZES: workItems,
                computeUnits: workItems.reduce(function (a, b) { return a * b})
            };
        });
        devices.sort(function (a, b) { return b.computeUnits - a.computeUnits; });

		var deviceWrapper;
		var err = devices.length ?
            null : new Error("No WebCL devices of specified type (" + cl.DEVICE_TYPE_ALL + ") found");
		for (var i = 0; i < devices.length; i++) {
            var wrapped = devices[i];
			try {
				wrapped.context = _createContext(cl, gl, platform, [wrapped.device])
				if (wrapped.context === null) {
					throw Error("Error creating WebCL context");
				}
				wrapped.queue = wrapped.context.createCommandQueue(wrapped.device, null);
			} catch (e) {
                console.debug("Skipping device due to error", i, wrapped, e);
				err = e;
				continue;
			}
			deviceWrapper = wrapped;
			break;
		}
        if (!deviceWrapper) {
            throw err;
        }

        console.debug("Device", deviceWrapper);

		var clObj = {
			"cl": cl,
			"context": deviceWrapper.context,
			"device": deviceWrapper.device,
			"queue": deviceWrapper.queue,
			"maxThreads": deviceWrapper.device.getInfo(cl.DEVICE_MAX_WORK_GROUP_SIZE),
			"numCores": deviceWrapper.device.getInfo(cl.DEVICE_MAX_COMPUTE_UNITS),
            "events": {
                "kernelStart": function() { },
                "kernelEnd":  function() { },
                "bufferCopyStart": function() { },
                "bufferCopyEnd": function() { },
                "bufferAquireStart": function() { },
                "bufferAquireEnd": function() { }
            }
		};

		clObj.compile = compile.bind(this, clObj);
		clObj.createBuffer = createBuffer.bind(this, clObj);
		clObj.createBufferGL = createBufferGL.bind(this, clObj);

		return clObj;
	});


	// This is a separate function from create() in order to allow polyfill() to override it on
	// older WebCL platforms, which have a different way of creating a context and enabling CL-GL
	// sharing.
	var _createContext = function(cl, gl, platform, devices) {
		cl.enableExtension("KHR_GL_SHARING");
		return cl.createContext(gl, devices);
	}

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
		var program = cl.context.createProgram(source);
		program.build([cl.device]);

		if (typeof kernels === "string") {
				var kernelObj = {};
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
			    kernelObj.kernel = program.createKernel(kernelName);
			    kernelObj.cl = cl;
				kernelObj.call = call.bind(this, kernelObj);
			 	kernelObj.setArgs = setArgs.bind(this, kernelObj);

			 	kernelObjs[kernelName] = kernelObj;
			}

			return kernelObjs;
		}

	});


	// Executes the specified kernel, with `threads` number of threads, setting each element in
	// `args` to successive position arguments to the kernel before calling.
	var call = Q.promised(function (kernel, threads, args, argTypes) {
		args = args || [];
		argTypes = argTypes || [];
		return kernel.setArgs(args, argTypes).then(function() {
			var workgroupSize = new Int32Array([threads]);
		    kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, workgroupSize.length, [], workgroupSize, []);
			kernel.cl.queue.finish();

			return kernel;
		});
	});


	var setArgs = Q.promised(function (kernel, args, argTypes) {
	    for (var i = 0; i < args.length; i++) {
	    	if(args[i] !== null) {
	    		kernel.kernel.setArg(i, args[i]);
	    	}
		}

		return kernel;
	});


	var createBuffer = Q.promised(function createBuffer(cl, size) {
	    var buffer = cl.context.createBuffer(cl.cl.MEM_READ_WRITE, size);
		if (buffer === null) {
		    throw new Error("Could not create the WebCL buffer");
		} else {
		    var bufObj = {
			    "buffer": buffer,
				"cl": cl,
				"size": size,
				"acquire": function() { return Q(); },
				"release": function() { return Q(); }
			};
			bufObj.delete = Q.promised(function() {
				bufObj.release();
				bufObj.size = 0;
				return null;
			});
			bufObj.write = write.bind(this, bufObj);
			bufObj.read = read.bind(this, bufObj);
			bufObj.copyBuffer = copyBuffer.bind(this, cl, bufObj);
			return bufObj;
		}
	});


	// TODO: If we call buffer.acquire() twice without calling buffer.release(), it should have no
	// effect.
	var createBufferGL = Q.promised(function (cl, vbo) {
		var buffer = cl.context.createFromGLBuffer(cl.cl.MEM_READ_WRITE, vbo.buffer);
		if (buffer === null) {
			throw new Error("Could not create WebCL buffer from WebGL buffer");
		} else {
			var bufObj = {
				"buffer": buffer,
				"cl": cl,
				"size": buffer.getInfo(cl.cl.MEM_SIZE),
				"acquire": Q.promised(function() {
					cl.queue.enqueueAcquireGLObjects([buffer]);
				}),
				"release": Q.promised(function() {
					cl.queue.enqueueReleaseGLObjects([buffer]);
				})
			};
			bufObj.delete = Q.promised(function() {
				return bufObj.release()
				.then(function() {
					bufObj.release();
					bufObj.size = 0;
					return null;
				})
			});
			bufObj.write = write.bind(this, bufObj);
			bufObj.read = read.bind(this, bufObj);
			bufObj.copyBuffer = copyBuffer.bind(this, cl, bufObj);

			return bufObj;
		}
	});


	var copyBuffer = Q.promised(function (cl, source, destination) {
		// TODO: acquire the buffers before copying them
		cl.queue.enqueueCopyBuffer(source.buffer, destination.buffer, 0, 0, Math.min(source.size, destination.size));
		return destination;
	});


	var write = Q.promised(function write(buffer, data) {
		return buffer.acquire()
		    .then(function () {
		        buffer.cl.queue.enqueueWriteBuffer(buffer.buffer, true, 0, data.byteLength, data);
			    return buffer.release();
		    })
		    .then(function() {
				buffer.cl.queue.finish();
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
			});
	});


	// Detects the WebCL platform we're running on, and modifies this module as needed.
	// Returns true if the the platform is out-of-date and needed to be polyfilled, and false if
	// the platform is up-to-date and no modification was needed.
	function polyfill() {
		// Detect if we're running on a current WebCL version
		if(typeof webcl.enableExtension == "function") {
			// If so, don't do anything
			return false;
		}

		console.debug("[cl.js] Detected old WebCL platform. Modifying functions to support it.");


		_createContext = function(cl, gl, platform, devices) {
			var extension = cl.getExtension("KHR_GL_SHARING");
			if (extension === null) {
			    throw new Error("Could not create a shared CL/GL context using the WebCL extension system");
			}
			return extension.createContext({
			    platform: platform,
			    devices: devices,
			    deviceType: cl.DEVICE_TYPE_GPU,
			    sharedContext: null
			});
		}


		call = Q.promised(function (kernel, threads, args, argTypes) {
			args = args || [];
			argTypes = argTypes || [];
			return kernel.setArgs(args, argTypes).then(function() {
				var workgroupSize = new Int32Array([threads]);
			    kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, null, workgroupSize, null);
				kernel.cl.queue.finish();

				return kernel;
			});
		});


		setArgs = Q.promised(function (kernel, args, argTypes) {
		    for (var i = 0; i < args.length; i++) {
			    if (args[i])
			        kernel.kernel.setArg(i, args[i].length ? args[i][0] : args[i], argTypes[i]);
			}
			return kernel;
		});

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


	return {
		"create": create,
		"compile": compile,
		"call": call,
		"setArgs": setArgs,
		"createBuffer": createBuffer,
		"createBufferGL": createBufferGL,
		"write": write,
		"types": types,
		"CURRENT_CL": CURRENT_CL
	};
});

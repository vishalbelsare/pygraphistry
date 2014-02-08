// TODO: in call() and setargs(), we currently requires a `argTypes` argument becuase older WebCL
// versions require us to pass in the type of kernel args. However, current versions do not. We want
// to keep this API as close to the current WebCL spec as possible. Therefore, we should not require
// that argument, even on old versions. Instead, we should query the kernel for the types of each
// argument and fill in that information automatically, when required by old WebCL versions.

define(["Q"], function (Q) {
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

		var devices = platform.getDevices(cl.DEVICE_TYPE_GPU);
		if (devices.length === 0) {
			throw new Error("No WebCL devices of specified type (" + cl.DEVICE_TYPE_GPU + ") found");
		}
		var device = devices[0];

		var context = _createContext(cl, gl, platform, [devices[0]])
		if (context === null) {
			throw new Error("Error creating WebCL context");
		}

		var queue = context.createCommandQueue(device, null);

		// Maximum number of work-items in a work-group executing a kernel on a single compute unit,
		// using the data parallel execution model.
		var maxThreads = device.getInfo(cl.DEVICE_MAX_WORK_GROUP_SIZE);
		// The number of parallel compute units on the OpenCL device. A work-group executes on a
		// single compute unit.
		var numCores = device.getInfo(cl.DEVICE_MAX_COMPUTE_UNITS);

		var clObj = {
			"cl": cl,
			"context": context,
			"device": device,
			"queue": queue,
			"maxThreads": maxThreads,
			"numCores": numCores
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


	var compile = Q.promised(function (cl, source, kernelName) {
		var program = cl.context.createProgram(source);
		program.build([cl.device]);
		var kernel = program.createKernel(kernelName);

		var kernelObj = {
			"cl": cl,
		    "kernel": kernel,
		}
		kernelObj.call = call.bind(this, kernelObj);
	 	kernelObj.setArgs = setArgs.bind(this, kernelObj);

	    return kernelObj;
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
		    kernel.kernel.setArg(i, args[i]);
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
			bufObj.write = write.bind(this, bufObj);
			bufObj.read = read.bind(this, bufObj);
			bufObj.copyBuffer = copyBuffer.bind(this, cl, bufObj);
			return bufObj;
		}
	});


	// TODO: If we call buffer.acquire() twice without calling buffer.release(), it should have no
	// effect.
	var createBufferGL = Q.promised(function (cl, vbo) {
		var buffer = cl.context.createFromGLBuffer(cl.cl.MEM_READ_WRITE, vbo);
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
			    kernel.kernel.setArg(i, args[i].length ? args[i][0] : args[i], argTypes[i]);
			}
			return kernel;
		});

		types = {
			int_t: WebCLKernelArgumentTypes.INT,
			uint_t: WebCLKernelArgumentTypes.UINT,
			local_t: WebCLKernelArgumentTypes.LOCAL_MEMORY_SIZE,
			float_t: WebCLKernelArgumentTypes.FLOAT,
			float2_t: WebCLKernelArgumentTypes.FLOAT
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

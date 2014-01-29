define(["Q"], function (Q) {
	function create(gl) {
		var deferred = Q.defer();
		
		if (typeof(webcl) === "undefined") {
		    deferred.reject("WebCL does not appear to be supported in your browser");
		}
		
		var cl = webcl;
		if (cl === null) {
			deferred.reject("Can't access WebCL object");
		}
		
		var platforms = cl.getPlatforms();
		if (platforms.length === 0) {
			deferred.reject("Can't find any WebCL platforms");
		}
		var platform = platforms[0];
		
		var devices = platform.getDevices(cl.DEVICE_TYPE_GPU);
		if (devices.length === 0) {
			deferred.reject("No WebCL devices of specified type (" + cl.DEVICE_TYPE_GPU + ") found")
		}
		var device = devices[0];
		
		cl.enableExtension("KHR_GL_SHARING");
		var context = cl.createContext(gl, [devices[0]]);
		if(context === null) {
			deferred.reject("Error creating WebCL context");
		}
		
		var queue = context.createCommandQueue(device, null);
		
		var maxThreads = device.getInfo(cl.DEVICE_MAX_WORK_GROUP_SIZE);
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
		
		deferred.resolve(clObj);
		
		return deferred.promise;
	}
	
	
	function compile(cl, source, kernelName) {
		var deferred = Q.defer()
		
		try {
			var program = cl.context.createProgram(source);
			program.build([cl.device]);
			var kernel = program.createKernel(kernelName);
			
			var kernelObj = {
				"cl": cl,
				"kernel": kernel,
			}
			kernelObj.call = call.bind(this, kernelObj);
			
			deferred.resolve(kernelObj);
		} catch(e) {
			deferred.reject(e);
		}
		
		return deferred.promise;
	}
	
	
	// Executes the specified kernel, with `threads` number of threads, setting each element in
	// `args` to successive position arguments to the kernel before calling.
	function call(kernel, threads, args) {
		return Q.promise(function(resolve, reject, notify) {
			// For all args other than the first (which is the kernel,) set each to successive
			// positional arguments to the kernel
			try {
				for(var i = 0; i < args.length; i++) {
					kernel.kernel.setArg(i, args[i]);
				}
				
				var workgroupSize = new Int32Array([threads]);
				kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, workgroupSize.length, [], workgroupSize, []);
				kernel.cl.queue.finish();
			} catch(err) {
				reject(err);
			}
			
			resolve(kernel);
		});
	}
	
	
	function createBuffer(cl, size) {
		return Q.promise(function(resolve, reject, notify) {
			var buffer = cl.context.createBuffer(cl.cl.MEM_READ_WRITE, size);
			if(buffer === null) {
				reject("Could not create the WebCL buffer");
			} else {
				var bufObj = {
					"buffer": buffer,
					"cl": cl,
					"size": size,
					"acquire": function() {
						return Q.promise(function(resolve) {
							resolve();
						});
					},
					"release": function() {
						return Q.promise(function(resolve) {
							resolve();
						});
					}
				};
				bufObj.write = write.bind(this, bufObj);
				bufObj.read = read.bind(this, bufObj);
				bufObj.copyBuffer = copyBuffer.bind(this, cl, bufObj);
				resolve(bufObj);
			}
		});
	}
	
	
	// TODO: If we call buffer.acquire() twice without calling buffer.release(), it should have no
	// effect.
	function createBufferGL(cl, vbo) {
		return Q.promise(function(resolve, reject, notify) {
			var buffer = cl.context.createFromGLBuffer(cl.cl.MEM_READ_WRITE, vbo);
			if (buffer === null) {
				reject("Could not create WebCL buffer from WebGL buffer");
			} else {
				var bufObj = {
					"buffer": buffer,
					"cl": cl,
					"size": buffer.getInfo(cl.cl.MEM_SIZE),
					"acquire": function() {
						return Q.promise(function(resolve) {
							try{
								cl.queue.enqueueAcquireGLObjects([buffer]);
								resolve();
							} catch(err) {
								reject(err);
							}
						});
					},
					"release": function() {
						return Q.promise(function(resolve) {
							try{
								cl.queue.enqueueReleaseGLObjects([buffer]);
								resolve();
							} catch(err) {
								reject(err);
							}
						});
					}
				};
				bufObj.write = write.bind(this, bufObj);
				bufObj.read = read.bind(this, bufObj);
				bufObj.copyBuffer = copyBuffer.bind(this, cl, bufObj);
				
				resolve(bufObj);
			}
		});
	}
	
	
	function copyBuffer(cl, source, destination) {
		return Q.promise(function(resolve, reject, notify) {
			// TODO: acquire the buffers before copying them
			cl.queue.enqueueCopyBuffer(source.buffer, destination.buffer, 0, 0, Math.min(source.size, destination.size));
			resolve(destination);
		});
	}
	
	
	function write(buffer, data) {
		return (buffer.acquire().then(function() {
			buffer.cl.queue.enqueueWriteBuffer(buffer.buffer, true, 0, data.byteLength, data);
			return buffer.release().then(function() {
				buffer.cl.queue.finish();
				return buffer;
			})
		}))
	}
	
	
	function read(buffer, target) {
		return (
			buffer.acquire()
			.then(function() {
				var copySize = Math.min(buffer.size, target.length * target.BYTES_PER_ELEMENT);
				buffer.cl.queue.enqueueReadBuffer(buffer.buffer, true, 0, copySize, target);
				return buffer.release;
			})
			.then(function() {
				return buffer;
			})
		);
	}
	
	
	return {
		"create": create,
		"compile": compile,
		"call": call,
		"createBuffer": createBuffer,
		"createBufferGL": createBufferGL,
		"write": write
	};
});

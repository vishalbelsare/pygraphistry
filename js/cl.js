define(["Q"], function (Q) {

    var CURRENT_CL = false;
    try { CURRENT_CL = typeof webcl.enableExtension == "function" ? true : false; }
    catch (e) { }
    console.log("Current?", CURRENT_CL);
    
	var create = Q.promised(function create (gl) {
		if (typeof(webcl) === "undefined") {
		    throw "WebCL does not appear to be supported in your browser";
		}
		
		var cl = webcl;
		if (cl === null) {
			throw "Can't access WebCL object";
		}
		
		var platforms = cl.getPlatforms();
		if (platforms.length === 0) {
			throw "Can't find any WebCL platforms";
		}
		var platform = platforms[0];
		
		var devices = platform.getDevices(cl.DEVICE_TYPE_GPU);
		if (devices.length === 0) {
			throw "No WebCL devices of specified type (" + cl.DEVICE_TYPE_GPU + ") found";
		}
		var device = devices[0];
		
		var context;
		if (CURRENT_CL) {
		  cl.enableExtension("KHR_GL_SHARING");
		  context = cl.createContext(gl, [devices[0]]);		
		} else {
            var extension = cl.getExtension("KHR_GL_SHARING");
            if (extension === null) {
                throw new SCException("Could not create a shared CL/GL context using the WebCL extension system");
            }
            context = extension.createContext({
                platform: platform,
                devices: devices,
                deviceType: cl.DEVICE_TYPE_GPU,
                sharedContext: null
            });
        }
		if (context === null) {
			throw "Error creating WebCL context";
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
		
		return clObj;
	});
	
	
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
	var call = Q.promised(function (kernel, threads, args, types) {
		args = args || [];

		// For all args other than the first (which is the kernel,) set each to successive
		// positional arguments to the kernel

		var workgroupSize = new Int32Array([threads]);
		if (CURRENT_CL) {
		    kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, workgroupSize.length, [], workgroupSize, []);
		} else {
		    kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, null, workgroupSize, null);				
		}
		kernel.cl.queue.finish();
		
		return kernel;
	});
	
	
	var setArgs = Q.promised(function (kernel, args, types) {		
	    for (var i = 0; i < args.length; i++) {
		    if (CURRENT_CL) {
			    kernel.kernel.setArg(i, args[i]);
			} else {
			    kernel.kernel.setArg(i, args[i].length ? args[i][0] : args[i], types[i]);
			}
		}			
		return kernel;
	});
	
		
	var createBuffer = Q.promised(function createBuffer(cl, size) {
	    var buffer = cl.context.createBuffer(cl.cl.MEM_READ_WRITE, size);
		if (buffer === null) {
		    throw "Could not create the WebCL buffer";
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
			throw "Could not create WebCL buffer from WebGL buffer";
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
	
	
	return {
		"create": create,
		"compile": compile,
		"call": call,
		"setArgs": setArgs,
		"createBuffer": createBuffer,
		"createBufferGL": createBufferGL,
		"write": write
	};
});

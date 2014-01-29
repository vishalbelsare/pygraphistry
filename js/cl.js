define(["Q"], function (Q) {
	function create(gl) {
		var clwrapper = {},
		    deferred = Q.defer();
		
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
		
		deferred.resolve({
			"cl": cl,
			"context": context,
			"device": device,
			"queue": queue
		});
		
		return deferred.promise;
	}
	
	
	function compile(cl, source, kernelName) {
		var deferred = Q.defer()
		
		try {
			var program = cl.context.createProgram(source);
			program.build([cl.device]);
			var kernel = program.createKernel(kernelName);
			
			deferred.resolve({
				"cl": cl,
				"kernel": kernel
			});
		} catch(e) {
			deferred.reject(e);
		}
		
		return deferred.promise;
	}
	
	
	return {
		"create": create,
		"compile": compile
	};
});

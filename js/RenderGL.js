define(["Q", "util"], function(Q, util) {
	function create(canvas) {
		var renderer = {}, 
		    deferred = Q.defer();
		
		var gl = canvas.getContext("experimental-webgl");
		var program = gl.createProgram();
		
		getShader(gl, "gl-vertex", gl.VERTEX_SHADER)
		.then(function(vertShader) {
			gl.attachShader(program, vertShader);
			
			return getShader(gl, "gl-point-fragment", gl.FRAGMENT_SHADER);
		})
		.then(function(fragShader) {
			gl.attachShader(program, fragShader);
			deferred.resolve(renderer);
		})
		.fail(function(err) {
			deferred.reject(err);
		});

		return deferred.promise;
	}
	
	
	function getShader(gl, id, shaderType) {		
		return util.getSource(id).then(function(source) {
			var shader = gl.createShader(shaderType);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			
			if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error("Error compiling WebGL shader with id " + id);
			}
			if(!gl.isShader(shader)) {
				throw new Error("After compiling shader with id " + id + ", WebGL is reporting it is not a shader");
			}
			
			return shader;
		});
	}
	
	
	return {
		"create": create
	};
});
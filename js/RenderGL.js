define(["Q", "glMatrix", "util"], function(Q, glMatrix, util) {
	function _init(renderer) {
		var gl = renderer.gl;
		
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		gl.clearColor(0, 0, 0, 1);
		gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height);
		
		var program = gl.createProgram();
		
		return getShader(gl, "gl-vertex", gl.VERTEX_SHADER)
		.then(function(vertShader) {
			gl.attachShader(program, vertShader);
			
			return getShader(gl, "gl-point-fragment", gl.FRAGMENT_SHADER);
		})
		.then(function(fragShader) {
			gl.attachShader(program, fragShader);
			
			gl.linkProgram(program);
			
			// TODO: Setup model/view/projection matrices
		})
	}
	
	function create(canvas) {
		var renderer = {}, 
		    deferred = Q.defer();
		
		renderer.canvas = canvas;
		renderer.gl = canvas.getContext("experimental-webgl");
		
		
		renderer.createBuffers = function(size) {
			
		};
		
		renderer.draw = function() {
			
		};
		
		
		_init(renderer).then(function() {
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
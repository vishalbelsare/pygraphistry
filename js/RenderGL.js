define(["Q", "glMatrix", "util"], function(Q, glMatrix, util) {
	function create(canvas) {
		var renderer = {};
		
		// FIXME: If 'gl === null' then we need to return a promise and reject it.
		var gl = canvas.getContext("experimental-webgl");
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		gl.clearColor(0, 0, 0, 1);
		gl.viewport(0, 0, canvas.clientWidth, canvas.clientHeight);
		renderer.gl = gl;
		
		var program = gl.createProgram();
		renderer.program = program;
		
		return (
			addShader(gl, "gl-vertex", gl.VERTEX_SHADER)
			.then(function(vertShader) {
				gl.attachShader(program, vertShader);
				
				return addShader(gl, "gl-point-fragment", gl.FRAGMENT_SHADER);
			})
			.then(function(fragShader) {
				gl.attachShader(program, fragShader);
				gl.linkProgram(program);
				gl.useProgram(program);
				
				// TODO: Set the mvp matrix in the vertex shader
				renderer.mvpLocation = gl.getUniformLocation(program, "mvp");
				renderer.curPosLoc = gl.getAttribLocation(program, "curPos");
				renderer.curVelLoc = gl.getAttribLocation(program, "curVel");
				// renderer.setCamera = setCamera.bind(this, renderer);
				renderer.createBuffer = createBuffer.bind(this, renderer);
				renderer.render = render.bind(this, renderer);
				
				return renderer;
				// return renderer.setCamera(glMatrix.vec3.fromValues(0,0,3), glMatrix.vec3.fromValues(0,0,0));
			})
		);
	}
	
	
	function addShader(gl, id, type) {
		return util.getSource(id).then(function(source) {
			var shader = gl.createShader(type);
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
	
	
	// function setCamera(renderer, position, target) {
	// 	return Q.promise(function(resolve, reject, notify) {
	// 		var mvpMatrix = glMatrix.mat4.create();
	// 		glMatrix.mat4.lookAt(mvpMatrix, position, target, glMatrix.vec3.fromValues(0, 1, 0));
	// 		resolve(mvpMatrix);
	// 	});
	// }
	
	
	function createBuffer(renderer, size) {
		return Q.promise(function(resolve, reject, notify) {
			var buffer = renderer.gl.createBuffer();
			var bufObj = {
				"buffer": buffer,
				"gl": renderer.gl
			};
			bufObj.write = write.bind(this, bufObj);
			
			resolve(bufObj);
		})
	}
	
	
	function write(buffer, data) {
		return Q.promise(function(resolve, reject) {
			buffer.gl.bindBuffer(buffer.gl.ARRAY_BUFFER, buffer.buffer);
			buffer.gl.bufferData(buffer.gl.ARRAY_BUFFER, data, buffer.gl.DYNAMIC_DRAW);
			resolve(buffer);
		});
	}
	
	
	function render(renderer) {
		return Q.promise(function(resolve, reject, notify) {
			var gl = renderer.gl;
			
			gl.clear(gl.COLOR_BUFFER_BIT);
			
			var mvpMatrix = glMatrix.mat4.create();
			gl.uniformMatrix4fv(renderer.mvpLocation, false, mvpMatrix);
						
			gl.bindBuffer(gl.ARRAY_BUFFER, renderer.curPoints.buffer);
			gl.enableVertexAttribArray(renderer.curPosLoc);
			gl.vertexAttribPointer(renderer.curPosLoc, 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);
			
			gl.bindBuffer(gl.ARRAY_BUFFER, renderer.curVelocities.buffer);
			gl.enableVertexAttribArray(renderer.curVelLoc);  
			gl.vertexAttribPointer(renderer.curVelLoc, 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);
			
			gl.drawArrays(gl.POINTS, 0, renderer.numPoints);
			gl.flush();
			
			resolve(renderer);
		});
	}
	
	
	return {
		"create": create,
		"addShader": addShader,
		"createBuffer": createBuffer,
		"write": write,
		"render": render
	};
});
define(["Q", "glMatrix", "util"], function(Q, glMatrix, util) {
	function create(canvas) {
		var renderer = {};
		
		// The dimensions of a canvas, by default, do not accurately reflect its size on screen (as
		// set in the HTML/CSS/etc.) This changes the canvas size to match its size on screen.
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		
		// FIXME: If 'gl === null' then we need to return a promise and reject it.
		var gl = canvas.getContext("experimental-webgl");
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		gl.clearColor(0, 0, 0, 1);
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
				
				renderer.canvas = canvas;
				renderer.curPosLoc = gl.getAttribLocation(program, "curPos");
				renderer.setCamera = setCamera.bind(this, renderer);
				renderer.createBuffer = createBuffer.bind(this, renderer);
				renderer.render = render.bind(this, renderer);
				
				return renderer.setCamera(glMatrix.vec3.fromValues(0,0,1), glMatrix.vec3.fromValues(0,0,0));
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
	
	
	function setCamera(renderer, position, target) {
		return Q.promise(function(resolve, reject, notify) {
			renderer.gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height);
			// console.debug("Viewport:", renderer.gl.getParameter(renderer.gl.VIEWPORT));
			
			var perspectiveMatrix = glMatrix.mat4.create();
			// Setup a basic orthographic projection
			glMatrix.mat4.ortho(perspectiveMatrix, 0, 1, 0, 1, -1, 1);
			
			// Setup a regular projection matrix
			// var aspect = renderer.canvas.clientWidth / renderer.canvas.clientHeight;
			// console.debug("Aspect ratio:", aspect);
			// glMatrix.mat4.perspective(pMatrix, 50, aspect, 0, 100);
			
			var viewMatrix = glMatrix.mat4.create();
			glMatrix.mat4.lookAt(viewMatrix, position, target, glMatrix.vec3.fromValues(0, 1, 0));
			
			var mvpMatrix = glMatrix.mat4.create();
			glMatrix.mat4.multiply(mvpMatrix, perspectiveMatrix, viewMatrix);
			
			var mvpLocation = renderer.gl.getUniformLocation(renderer.program, "mvp");
			renderer.gl.uniformMatrix4fv(mvpLocation, false, mvpMatrix);
						
			resolve(renderer);
		});
	}
	
	
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
						
			gl.bindBuffer(gl.ARRAY_BUFFER, renderer.curPoints.buffer);
			gl.enableVertexAttribArray(renderer.curPosLoc);
			gl.vertexAttribPointer(renderer.curPosLoc, 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);
						
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
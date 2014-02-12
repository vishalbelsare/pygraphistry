define(["Q", "glMatrix", "util"], function(Q, glMatrix, util) {
	function create(canvas, dimensions) {
		var renderer = {};

		// The dimensions of a canvas, by default, do not accurately reflect its size on screen (as
		// set in the HTML/CSS/etc.) This changes the canvas size to match its size on screen.
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;

		// FIXME: If 'gl === null' then we need to return a promise and reject it.
		var gl = canvas.getContext("experimental-webgl", {antialias: true, premultipliedAlpha: false});
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.DEPTH_TEST);
		gl.clearColor(0, 0, 0, 0);
		renderer.gl = gl;

		renderer.pointProgram = gl.createProgram();
		renderer.edgeProgram = gl.createProgram();

		return (
			Q.all([addShader(gl, "point.vertex", gl.VERTEX_SHADER),
				   addShader(gl, "point.fragment", gl.FRAGMENT_SHADER)])
			.spread(function(vertShader, fragShader) {
				gl.attachShader(renderer.pointProgram, vertShader);
				gl.attachShader(renderer.pointProgram, fragShader);
				gl.linkProgram(renderer.pointProgram);

				return Q.all([addShader(gl, "edge.vertex", gl.VERTEX_SHADER),
					          addShader(gl, "edge.fragment", gl.FRAGMENT_SHADER)]);
			})
			.spread(function(vertShader, fragShader) {
				gl.attachShader(renderer.edgeProgram, vertShader);
				gl.attachShader(renderer.edgeProgram, fragShader);
				gl.linkProgram(renderer.edgeProgram);

				gl.lineWidth(2);

				renderer.canvas = canvas;
				renderer.curPointPosLoc = gl.getAttribLocation(renderer.pointProgram, "curPos");
				renderer.curEdgePosLoc = gl.getAttribLocation(renderer.edgeProgram, "curPos");
				renderer.setCamera2d = setCamera2d.bind(this, renderer);
				renderer.createBuffer = createBuffer.bind(this, renderer);
				renderer.render = render.bind(this, renderer);
				renderer.buffers = {};
				renderer.elementsPerPoint = 2;
				renderer.numPoints = 0;
				renderer.numEdges = 0;

				// TODO: Enlarge the camera by the (size of gl points / 2) so that points are fully
				// on screen even if they're at the edge of the graph.
				return renderer.setCamera2d(-0.01, dimensions[0] + 0.01, -0.01, dimensions[1] + 0.01);
			})
		);
	}


	function addShader(gl, id, type) {
		return util.getSource(id + ".glsl").then(function(source) {
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


	// TODO: Move back to a Mat4-based MVP matrix. However, retain the simple
	// (left, right, top, bottom) arguments. Perhaps make the MVP matrix an object field
	// (initialized to the identity matrix) and have some simple function for move, rotate, etc.


	// function setCamera(renderer, position, target) {
	// 	return Q.promise(function(resolve, reject, notify) {
	// 		renderer.gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height);
	// 		// console.debug("Viewport:", renderer.gl.getParameter(renderer.gl.VIEWPORT));

	// 		var perspectiveMatrix = glMatrix.mat4.create();
	// 		// Setup a basic orthographic projection
	// 		glMatrix.mat4.ortho(perspectiveMatrix, 0, 1, 0, 1, -1, 1);

	// 		// Setup a regular projection matrix
	// 		// var aspect = renderer.canvas.clientWidth / renderer.canvas.clientHeight;
	// 		// console.debug("Aspect ratio:", aspect);
	// 		// glMatrix.mat4.perspective(pMatrix, 50, aspect, 0, 100);

	// 		var viewMatrix = glMatrix.mat4.create();
	// 		glMatrix.mat4.lookAt(viewMatrix, position, target, glMatrix.vec3.fromValues(0, 1, 0));

	// 		var mvpMatrix = glMatrix.mat4.create();
	// 		glMatrix.mat4.multiply(mvpMatrix, perspectiveMatrix, viewMatrix);

	// 		var mvpLocation = renderer.gl.getUniformLocation(renderer.program, "mvp");
	// 		renderer.gl.uniformMatrix4fv(mvpLocation, false, mvpMatrix);

	// 		resolve(renderer);
	// 	});
	// }


	function setCamera2d(renderer, left, right, bottom, top) {
		return Q.promise(function(resolve, reject, notify) {
			renderer.gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height);

			var lr = 1 / (left - right),
			    bt = 1 / (bottom - top);

			var mvpMatrix = glMatrix.mat2d.create();
			glMatrix.mat2d.scale(mvpMatrix, mvpMatrix, glMatrix.vec2.fromValues(-2 * lr, -2 * bt));
			glMatrix.mat2d.translate(mvpMatrix, mvpMatrix, glMatrix.vec2.fromValues((left+right)*lr, (top+bottom)*bt));

			var mvpMat3 = glMatrix.mat3.create();
			glMatrix.mat3.fromMat2d(mvpMat3, mvpMatrix);

			renderer.gl.useProgram(renderer.pointProgram);
			var mvpLocation = renderer.gl.getUniformLocation(renderer.pointProgram, "mvp");
			renderer.gl.uniformMatrix3fv(mvpLocation, false, mvpMat3);

			renderer.gl.useProgram(renderer.edgeProgram);
			var mvpLocation = renderer.gl.getUniformLocation(renderer.edgeProgram, "mvp");
			renderer.gl.uniformMatrix3fv(mvpLocation, false, mvpMat3);

			resolve(renderer);
		});
	}


	function createBuffer(renderer, data) {
		var args = arguments;
		return Q.promise(function(resolve, reject, notify) {
			try {
				var buffer = renderer.gl.createBuffer();
				var bufObj = {
					"buffer": buffer,
					"gl": renderer.gl
				};
				bufObj.write = write.bind(this, bufObj);
			} catch(err) {
				reject(err);
			}

			if(data) {
				bufObj.write(data)
				.then(function(){
					resolve(bufObj);
				}, function(err) {
					reject(err);
				});
			} else {
				resolve(bufObj);
			}
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

			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

			// If there are no points in the graph, don't render anything
			if(renderer.numPoints < 1) {
				resolve(renderer);
			}

			gl.depthFunc(gl.LEQUAL);

			gl.useProgram(renderer.pointProgram);
			gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffers.curPoints.buffer);
			gl.enableVertexAttribArray(renderer.curPointPosLoc);
			gl.vertexAttribPointer(renderer.curPointPosLoc, renderer.elementsPerPoint, gl.FLOAT, false, renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);

			gl.drawArrays(gl.POINTS, 0, renderer.numPoints);

			if(renderer.numEdges > 0) {
				// Make sure to draw the edges behind the points
				gl.depthFunc(gl.LESS);

				gl.useProgram(renderer.edgeProgram);
				gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffers.springs.buffer);
				gl.enableVertexAttribArray(renderer.curEdgePosLoc);
				gl.vertexAttribPointer(renderer.curEdgePosLoc, renderer.elementsPerPoint, gl.FLOAT, false, renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);

				gl.drawArrays(gl.LINES, 0, renderer.numEdges * 2);
			}

			gl.finish();

			resolve(renderer);
		});
	}


	return {
		"create": create,
		"addShader": addShader,
		"setCamera2d": setCamera2d,
		"createBuffer": createBuffer,
		"write": write,
		"render": render
	};
});
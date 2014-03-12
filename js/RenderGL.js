define(["Q", "glMatrix", "util"], function(Q, glMatrix, util) {
    'use strict';

	var create = Q.promised(function(canvas, dimensions, visible) {
		visible = visible || {};

		var renderer = {};

		// The dimensions of a canvas, by default, do not accurately reflect its size on screen (as
		// set in the HTML/CSS/etc.) This changes the canvas size to match its size on screen.
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;

		var gl = canvas.getContext("experimental-webgl", {antialias: true, premultipliedAlpha: false});
        if(gl === null) {
            throw new Error("Could not initialize WebGL");
        }

        // Set up WebGL settings
        gl.enable(gl.BLEND);
		// gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
		gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
		gl.enable(gl.DEPTH_TEST);
		gl.clearColor(0, 0, 0, 0);
        // Lines should be 1px wide
        gl.lineWidth(1);

        // Populate the renderer object with default values, empty containers, etc.
        renderer.gl = gl;
        renderer.canvas = canvas;
        renderer.buffers = {};
        renderer.elementsPerPoint = 2;
        renderer.numPoints = 0;
        renderer.numEdges = 0;
        renderer.numMidPoints = 0;

        // For
        renderer.setCamera2d = setCamera2d.bind(this, renderer);
        renderer.createBuffer = createBuffer.bind(this, renderer);
        renderer.render = render.bind(this, renderer);
        renderer.createProgram = createProgram.bind(this, renderer);
        renderer.setVisible = setVisible.bind(this, renderer);
        renderer.isVisible = isVisible.bind(this, renderer);

        renderer.visible = {points: true, edges: true, midpoints: false, midedges: false};
        renderer.setVisible(visible);


        return Q.all(
            ['point', 'edge', 'midpoint', 'midedge'].map(function (name) {
                return renderer.createProgram(name + '.vertex', name + '.fragment');
        }))
        .spread(function (pointProgram, edgeProgram, midpointProgram, midedgeProgram) {
            renderer.pointProgram = pointProgram;
            renderer.edgeProgram = edgeProgram;
            renderer.midpointProgram = midpointProgram;
            renderer.midedgeProgram = midedgeProgram;

            renderer.curPointPosLoc = gl.getAttribLocation(renderer.pointProgram.glProgram, "curPos");
            renderer.curEdgePosLoc = gl.getAttribLocation(renderer.edgeProgram.glProgram, "curPos");
            renderer.curMidPointPosLoc = gl.getAttribLocation(renderer.midpointProgram.glProgram, "curPos");
            renderer.curMidEdgePosLoc = gl.getAttribLocation(renderer.midedgeProgram.glProgram, "curPos");
            // renderer.curCurvesPosLoc = gl.get

            // TODO: Enlarge the camera by the (size of gl points / 2) so that points are fully
            // on screen even if they're at the edge of the graph.
            return renderer.setCamera2d(-0.01, dimensions[0] + 0.01, -0.01, dimensions[1] + 0.01);
		});
	});


    function createProgram(renderer, vertexShaderID, fragmentShaderID) {
        var gl = renderer.gl;

        var pragObj = {};
        pragObj.renderer = renderer;
        pragObj.glProgram = gl.createProgram();

        return Q.all([ util.getSource(vertexShaderID + ".glsl"),
                       util.getSource(fragmentShaderID + ".glsl") ])
        .spread(function(vertShaderSource, fragShaderSource) {

            function compileShader(program, shaderSource, shaderType) {
                var shader = renderer.gl.createShader(shaderType);
                renderer.gl.shaderSource(shader, shaderSource);
                renderer.gl.compileShader(shader);
                if(!renderer.gl.getShaderParameter(shader, renderer.gl.COMPILE_STATUS)) {
                    throw new Error("Error compiling WebGL shader (shader type: " + shaderType + ")");
                }
                if(!renderer.gl.isShader(shader)) {
                    throw new Error("After compiling shader, WebGL is reporting it is not valid");
                }
                renderer.gl.attachShader(program.glProgram, shader);

                return shader;
            }

            pragObj.vertexShader   = compileShader(pragObj, vertShaderSource, gl.VERTEX_SHADER);
            pragObj.fragmentShader = compileShader(pragObj, fragShaderSource, gl.FRAGMENT_SHADER);

            gl.linkProgram(pragObj.glProgram);
            return pragObj;
        });
    }



	// // TODO: Move back to this Mat4-based MVP matrix. However, retain the simple
	// // (left, right, top, bottom) arguments. Perhaps make the MVP matrix an object field
	// // (initialized to the identity matrix) and have some simple function for move, rotate, etc.
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

			['pointProgram', 'edgeProgram', 'midpointProgram', 'midedgeProgram'].forEach(function (name) {
				var program = renderer[name].glProgram;
			    renderer.gl.useProgram(program);
			    var mvpLocation = renderer.gl.getUniformLocation(program, "mvp");
			    renderer.gl.uniformMatrix3fv(mvpLocation, false, mvpMat3);
			})

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
				bufObj.delete = Q.promised(function() {
					renderer.gl.deleteBuffer(buffer);
					return null;
				})
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


    /**
     * Enable or disable the drawing of elements in the scene. Elements are one of: points, edges,
     * midpoints, midedges.
     *
     * @param renderer - the renderer object created with GLRunner.create()
     * @param {Object} visible - An object with keys for 0 or more objects to set the visibility
     * for. Each value should be true or false.
     * @returns the renderer object passed in, with visibility options updated
     */
	function setVisible(renderer, visible) {
		util.extend(renderer.visible, visible);

        return renderer;
	}


    /**
     * Determines if the element passed in should be visible in image
     *
     * @param renderer - the renderer object created with GLRunner.create()
     * @param element - the name of the element to check visibility for
     *
     * @returns a boolean value determining if the object should be visible (false by default)
     */
    function isVisible(renderer, element) {
        // TODO: check the length of the associated buffer to see if it's >0; return false if not.
        return (renderer.visible[element] || false);
    }


	function render(renderer) {
		return Q.promise(function(resolve, reject, notify) {

			var gl = renderer.gl;

			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			// If there are no points in the graph, don't render anything
			if(renderer.numPoints < 1) {
				resolve(renderer);
			}

			gl.depthFunc(gl.LEQUAL);

            if (renderer.isVisible("points")) {
				gl.useProgram(renderer.pointProgram.glProgram);
				gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffers.curPoints.buffer);
				gl.enableVertexAttribArray(renderer.curPointPosLoc);
				gl.vertexAttribPointer(renderer.curPointPosLoc, renderer.elementsPerPoint, gl.FLOAT, false, renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
				gl.drawArrays(gl.POINTS, 0, renderer.numPoints);
			}

			if (renderer.isVisible("midpoints")) {
				gl.useProgram(renderer.midpointProgram.glProgram);
				gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffers.curMidPoints.buffer);
				gl.enableVertexAttribArray(renderer.curMidPointPosLoc);
				gl.vertexAttribPointer(renderer.curMidPointPosLoc, renderer.elementsPerPoint, gl.FLOAT, false, renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
				gl.drawArrays(gl.POINTS, 0, renderer.numMidPoints);
			}


			if(renderer.numEdges > 0) {
				// Make sure to draw the edges behind the points
				gl.depthFunc(gl.LESS);

				if (renderer.isVisible("edges")) {
					gl.useProgram(renderer.edgeProgram.glProgram);
					gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffers.springs.buffer);
					gl.enableVertexAttribArray(renderer.curEdgePosLoc);
					gl.vertexAttribPointer(renderer.curEdgePosLoc, renderer.elementsPerPoint, gl.FLOAT, false, renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
					gl.drawArrays(gl.LINES, 0, renderer.numEdges * 2);
				}

				if (renderer.isVisible("midedges")) {
					gl.useProgram(renderer.midedgeProgram.glProgram);
					gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffers.midSprings.buffer);
					gl.enableVertexAttribArray(renderer.curMidEdgePosLoc);
					gl.vertexAttribPointer(renderer.curMidEdgePosLoc, renderer.elementsPerPoint, gl.FLOAT, false, renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
					gl.drawArrays(gl.LINES, 0, renderer.numMidEdges * 2);
				}

			}

			gl.finish();

			resolve(renderer);
		});
	}


	return {
		"create": create,
        "createProgram": createProgram,
		"setCamera2d": setCamera2d,
		"createBuffer": createBuffer,
		"write": write,
        "setVisible": setVisible,
        "isVisible": isVisible,
		"render": render
	};
});

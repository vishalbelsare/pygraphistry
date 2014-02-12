define(["Q", "util", "cl"], function(Q, util, cljs) {
	var randLength = 73;

	function create(renderer, dimensions) {
		return cljs.create(renderer.gl)
		.then(function(cl) {
			// Compile the WebCL kernels
			return util.getSource("apply-forces.cl")
			.then(function(source) {
				return cl.compile(source, ["apply_points", "apply_springs"]);
			})
			.then(function(kernels) {
				var simObj = {
					"renderer": renderer,
					"cl": cl,
					"pointKernel": kernels["apply_points"],
					"edgesKernel": kernels["apply_springs"],
					"elementsPerPoint": 2
				};
				simObj.tick = tick.bind(this, simObj);
				simObj.setPoints = setPoints.bind(this, simObj);
				simObj.setPhysics = setPhysics.bind(this, simObj);
				simObj.dimensions = dimensions;
				simObj.events = {
					"kernelStart": function() { },
					"kernelEnd":  function() { },
					"bufferCopyStart": function() { },
					"bufferCopyEnd": function() { },
					"bufferAquireStart": function() { },
					"bufferAquireEnd": function() { }
				};

				console.debug("WebCL simulator created");
				return simObj
			});
		})

	}


	function setPoints(simulator, points) {
		if(points.length % simulator.elementsPerPoint !== 0) {
			throw new Error("The points buffer is an invalid size (must be a multiple of " + simulator.elementsPerPoint + ")");
		}

		simulator.numPoints = points.length / simulator.elementsPerPoint;
		simulator.renderer.numPoints = simulator.numPoints;

		console.debug("Number of points:", simulator.renderer.numPoints);

		return (
			// Create buffers and write initial data to them, then set
			Q.all([simulator.renderer.createBuffer(points.length * simulator.elementsPerPoint * points.BYTES_PER_ELEMENT),
				   simulator.cl.createBuffer(points.length * simulator.elementsPerPoint * points.BYTES_PER_ELEMENT),
				   simulator.cl.createBuffer(randLength * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT)])
			.spread(function(pointsVBO, nextPointsBuffer, randBuffer) {
				simulator.renderer.curPoints = pointsVBO;
				simulator.nextPoints = nextPointsBuffer;
				simulator.randValues = randBuffer;

				var rands = new Float32Array(randLength * simulator.elementsPerPoint);
				for(var i = 0; i < rands.length; i++) {
					rands[i] = Math.random();
				}

				return Q.all([pointsVBO.write(points), simulator.randValues.write(rands)]);
			})
			.spread(function(pointsVBO, randBuffer) {
				return simulator.cl.createBufferGL(pointsVBO.buffer);
			})
			.then(function(pointsBuf) {
				simulator.curPoints = pointsBuf;

				var types = [];
				if(!cljs.CURRENT_CL) {
					// FIXME: find the old WebCL platform type for float2
					types = [cljs.types.int_t, null, null , cljs.types.local_t, cljs.types.float_t, cljs.types.float_t, cljs.types.float_t, cljs.types.float_t, null, cljs.types.uint_t];
				}

				var localPos = Math.min(simulator.cl.maxThreads, simulator.numPoints) * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
				return simulator.pointKernel.setArgs(
				    [new Int32Array([simulator.numPoints]),
				     simulator.curPoints.buffer,
				     simulator.nextPoints.buffer,
				     new Uint32Array([localPos]),
				     new Float32Array([simulator.dimensions[0]]),
				     new Float32Array([simulator.dimensions[1]]),
				     new Float32Array([-0.00001]),
				     new Float32Array([0.2]),
				     simulator.randValues.buffer,
				     new Uint32Array([0])],
					types);
			})
		);
	}

	function setPhysics(simulator, cfg) {
	    cfg = cfg || {};
	    simulator.pointKernel.setArgs(
	     [null, null, null, null, null, null,
	         cfg.charge ? new Float32Array([cfg.charge]) : null, cfg.gravity ? new Float32Array([cfg.gravity]) : null,
	         null, null],
	     [null, null, null, null, null, null,
	         cfg.charge ? cljs.types.float_t : null, cfg.gravity ? cljs.types.float_t : null,
	         null, null]
	     );
	}


	function tick(simulator, stepNumber) {
	    simulator.pointKernel.setArgs(
	     [null, null, null, null, null, null, null, null, null, new Uint32Array([stepNumber])],
	     [null, null, null, null, null, null, null, null, null, cljs.types.uint_t]
	     );


		simulator.events.bufferAquireStart();

		return Q.all([simulator.curPoints.acquire()])
		.then(function() {
			simulator.events.bufferAquireEnd();
			simulator.events.kernelStart();

			return simulator.pointKernel.call(simulator.numPoints, []);
		})
		.then(function() {
			simulator.events.kernelEnd();
			simulator.events.bufferCopyStart();

			return Q.all([simulator.nextPoints.copyBuffer(simulator.curPoints)]);
		})
		.then(function() {
			simulator.events.bufferCopyEnd();
			simulator.events.bufferAquireStart();

			return Q.all([simulator.curPoints.release()]);
		})
		.then(function() {
			simulator.events.bufferAquireEnd();
			// TODO: Use a callback argument to finish(), rather than letting it block when we don't
			// provide one.
			simulator.cl.queue.finish();
			return simulator;
		});
	}


	return {
		"create": create,
		"setPoints": setPoints,
		"tick": tick
	};
});
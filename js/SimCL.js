define(["Q", "util", "cl"], function(Q, util, cljs) {
	var randLength = 73;

	function create(renderer, dimensions) {
		return cljs.create(renderer.gl)
		.then(function(cl) {
			// Compile the WebCL kernels
			return util.getSource("cl-nbody-mass-springs.cl")
			.then(function(source) {
				return cl.compile(source, "nbody_compute_repulsion");
			})
			.then(function(kernel) {
				var simObj = {
					"renderer": renderer,
					"cl": cl,
					"kernel": kernel,
					"elementsPerPoint": 2
				};
				simObj.tick = tick.bind(this, simObj);
				simObj.setData = setData.bind(this, simObj);
				simObj.dumpBuffers = dumpBuffers.bind(this, simObj);
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


	function setData(simulator, points) {
		if(points.length % simulator.elementsPerPoint !== 0) {
			throw new Error("The points buffer is an invalid size (must be a multiple of " + simulator.elementsPerPoint + ")");
		}
		simulator.numPoints = points.length / simulator.elementsPerPoint;
		simulator.bufferSize = points.length * points.BYTES_PER_ELEMENT;
		simulator.renderer.numPoints = simulator.numPoints;
		simulator.renderer.bufferSize = simulator.bufferSize;

		console.debug("Number of points:", simulator.renderer.numPoints);

		return (
			simulator.renderer.createBuffer(points.length * simulator.elementsPerPoint * points.BYTES_PER_ELEMENT)
			.then(function(pointsVBO) {
				simulator.renderer.curPoints = pointsVBO;
				return pointsVBO.write(points);
			})
			.then(function(pointsVBO) {
				return simulator.cl.createBufferGL(pointsVBO.buffer);
			})
			.then(function(pointsBuf) {
				simulator.curPoints = pointsBuf;
				return simulator.curPoints.write(points);
			})
			.then(function(pointsBuf) {
				return simulator.cl.createBuffer(points.length * simulator.elementsPerPoint * points.BYTES_PER_ELEMENT);
			})
			.then(function(nextPoints) {
				simulator.nextPoints = nextPoints;
				return simulator.cl.createBuffer(randLength * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT)
			})
			.then(function(randBuffer) {
				simulator.randValues = randBuffer;
				var rands = new Float32Array(randLength * simulator.elementsPerPoint);
				for(var i = 0; i < rands.length; i++) {
					rands[i] = Math.random();
				}
				return simulator.randValues.write(rands);
			})
			.then(function() {
				var types = [];
				if(!cljs.CURRENT_CL) {
					// FIXME: find the old WebCL platform type for float2
					types = [cljs.types.int_t, null, null , cljs.types.local_t, cljs.types.float_t, cljs.types.float_t, cljs.types.float_t, cljs.types.float_t, null, cljs.types.uint_t];
				}

				var localPos = Math.min(simulator.cl.maxThreads, simulator.numPoints) * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
				return simulator.kernel.setArgs(
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
	    simulator.kernel.setArgs(
	     [null, null, null, null, null, null,
	         cfg.charge ? new Float32Array([cfg.charge]) : null, cfg.gravity ? new Float32Array([cfg.gravity]) : null,
	         null, null],
	     [null, null, null, null, null, null,
	         cfg.charge ? cljs.types.float_t : null, cfg.gravity ? cljs.types.float_t : null,
	         null, null]
	     );
	}


	function tick(simulator, stepNumber) {
	    simulator.kernel.setArgs(
	     [null, null, null, null, null, null, null, null, null, new Uint32Array([stepNumber])],
	     [null, null, null, null, null, null, null, null, null, cljs.types.uint_t]
	     );


		simulator.events.bufferAquireStart();

		return Q.all([simulator.curPoints.acquire()])
		.then(function() {
			simulator.events.bufferAquireEnd();
			simulator.events.kernelStart();

			return simulator.kernel.call(simulator.numPoints, []);
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


	function dumpBuffers(simulator) {
		return Q.promise(function(resolve, reject, notify) {
			console.debug("Dumping buffers for debugging");
			console.debug("Buffer size:", simulator.bufferSize);

			var testPos = new Float32Array(simulator.bufferSize);
			simulator.curPoints.read(testPos)
			.then(function() {
				console.debug("Buffer data:", testPos);
				resolve(simulator);
			})
		});
	}


	return {
		"create": create,
		"setData": setData,
		"tick": tick,
		"dumpBuffers": dumpBuffers
	};
});
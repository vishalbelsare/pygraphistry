define(["Q", "util", "cl"], function(Q, util, cljs) {
	function create(renderer, points, velocities) {
		return cljs.create(renderer.gl)
		.then(function(cl) {
			// Compile the WebCL kernels
			return util.getSource("cl-nbody-mass-springs")
			.then(function(source) {
				return cl.compile(source, "nbody_compute_repulsion");
			})
			.then(function(kernel) {
				var simObj = {
					"renderer": renderer,
					"cl": cl,
					"kernel": kernel
				};
				simObj.tick = tick.bind(this, simObj);
				simObj.setData = setData.bind(this, simObj);
				simObj.dumpBuffers = dumpBuffers.bind(this, simObj);
				
				console.debug("WebCL simulator created");
				return simObj
				
			});
		})
		
	}
	
	
	function setData(simulator, points, velocities) {
		if(points.length % 4 !== 0) {
			throw new Error("The points buffer is an invalid size (must be a multiple of 4)");
		}
		simulator.numPoints = points.length / 4;
		simulator.bufferSize = points.length * points.BYTES_PER_ELEMENT;
		simulator.renderer.numPoints = simulator.numPoints;
		simulator.renderer.bufferSize = simulator.bufferSize;
		
		console.debug("Number of points:", simulator.renderer.numPoints);
		
		return (
			simulator.renderer.createBuffer(points.length * 4 * points.BYTES_PER_ELEMENT)
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
				return simulator.cl.createBuffer(points.length * 4 *points.BYTES_PER_ELEMENT);
			})
			.then(function(velsBuf) {
				simulator.curVelocities = velsBuf;
				return simulator.curVelocities.write(velocities);
			})
			.then(function(velsBuf) {
				return simulator.cl.createBuffer(points.length * 4 *points.BYTES_PER_ELEMENT);
			})
			.then(function(nextPoints) {
				simulator.nextPoints = nextPoints;
				return simulator.cl.createBuffer(velocities.length * 4 * velocities.BYTES_PER_ELEMENT);
			})
			.then(function(nextVelocities) {
				simulator.nextVelocities = nextVelocities;
			
				var types = [];
				if(!cljs.CURRENT_CL) {
					types = [cljs.types.int_t, null, null , cljs.types.float_t, cljs.types.local_t];
				}
				
				var localPos = Math.min(simulator.cl.maxThreads, simulator.numPoints) * 4 * Float32Array.BYTES_PER_ELEMENT;
				return simulator.kernel.setArgs(
				    [new Int32Array([simulator.numPoints]),
				     simulator.curPoints.buffer,
				     simulator.nextPoints.buffer,
				     new Float32Array([0.005]),
				     new Uint32Array([localPos])],
					types);
			})
		);
	}
	
	
	function tick(simulator) {
		return Q.all([simulator.curPoints.acquire(), simulator.curVelocities.acquire()])
		.then(function() {
			return simulator.kernel.call(simulator.numPoints, []);
		})
		.then(function() {
			return Q.all([simulator.nextPoints.copyBuffer(simulator.curPoints), 
				simulator.nextVelocities.copyBuffer(simulator.curVelocities)]);
		})
		.then(function() {
			return Q.all([simulator.curPoints.release(), simulator.curVelocities.release()]);
		})
		.then(function() {
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
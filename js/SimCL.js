define(["Q", "util", "cl"], function(Q, util, cljs) {
	function create(renderer, points, velocities) {
		return cljs.create(renderer.gl)
		.then(function(cl) {
			// Compile the WebCL kernels
			return util.getSource("cl-nbody")
			.then(function(source) {
				return cl.compile(source, "nbody_kernel_GPU");
			})
			.then(function(kernel) {
				var simObj = {
					"renderer": renderer,
					"cl": cl,
					"kernel": kernel
				};
				simObj.tick = tick.bind(this, simObj);
				simObj.setData = setData.bind(this, simObj);
				
				console.debug("WebCL simulator created");
				return simObj
				
			});
		})
		
	}
	
	
	function setData(simulator, points, velocities) {
		simulator.numPoints = points.length / 4;
		simulator.renderer.numPoints = simulator.numPoints;
		
		return (
			simulator.renderer.createBuffer(points.length * points.BYTES_PER_ELEMENT)
			.then(function(pointsVBO) {
				simulator.renderer.curPoints = pointsVBO;
				return pointsVBO.write(points);
			})
			.then(function(pointsVBO) {
				return simulator.cl.createBufferGL(pointsVBO.buffer);
			})
			.then(function(pointsBuf) {
				simulator.curPoints = pointsBuf;
				return simulator.curPoints.write(points)
			})
			.then(function(pointsBuf) {
				return simulator.renderer.createBuffer(velocities.length * velocities.BYTES_PER_ELEMENT);
			})
			.then(function(velsVBO) {
				simulator.renderer.curVelocities = velsVBO;
				return velsVBO.write(velocities);
			})
			.then(function(velsVBO) {
				return simulator.cl.createBufferGL(velsVBO.buffer);
			})
			.then(function(velsBuf) {
				simulator.curVelocities = velsBuf;
				return simulator.curVelocities.write(velocities);
			})
			.then(function(velsBuf) {
				return simulator.cl.createBuffer(points.length * points.BYTES_PER_ELEMENT);
			})
			.then(function(nextPoints) {
				simulator.nextPoints = nextPoints;
				return simulator.cl.createBuffer(velocities.length * velocities.BYTES_PER_ELEMENT);
			})
			.then(function(nextVelocities) {
				simulator.nextVelocities = nextVelocities;
				
				return simulator;
			})
		);
	}
	
	
	function tick(simulator) {
		return Q.all([simulator.curPoints.acquire(), simulator.curVelocities.acquire(),
			simulator.nextPoints.acquire(), simulator.nextVelocities.acquire()])
		.then(function() {
			// arg 5 is localPos (in CL code) aka localMemSize (in JS code.) It equals
			// localWorkSize[0] * POS_ATTRIB_SIZE * Float32Array.BYTES_PER_ELEMENT;
			// 	localWorkSize[0] = Math.min(workGroupSize, NBODY);
			// 	NBODY = number of points
			// 	workGroupSize = device.getInfo(cl.DEVICE_MAX_WORK_GROUP_SIZE);
			// In other words, it's the lesser of points.length or DEVICE_MAX_WORK_GROUP_SIZE, times
			// the number of bytes per point (= 4 * 4 = 16)
			
			var localPos = Math.min(simulator.cl.maxThreads, simulator.numPoints) * 4 * Float32Array.BYTES_PER_ELEMENT;
			
			return simulator.kernel.call(simulator.cl.numCores, [simulator.curPoints.buffer,
				simulator.curVelocities.buffer, new Int32Array([simulator.numPoints]),
				new Float32Array([0.005]), new Int32Array([50]), new Uint32Array([localPos]),
				simulator.nextPoints.buffer, simulator.nextVelocities.buffer]);
		})
		.then(function() {
			return simulator.nextPoints.copyBuffer(simulator.curPoints);
		})
		.then(function() {
			return simulator.nextVelocities.copyBuffer(simulator.curVelocities);
		})
		.then(function() {
			return Q.all([simulator.curPoints.release(), simulator.curVelocities.release(),
				simulator.nextPoints.release(), simulator.nextVelocities.release()]);
		});
	}
	
	
	return {
		"create": create,
		"tick": tick
	};
});
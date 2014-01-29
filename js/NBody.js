define(["Q", "glMatrix"], function(Q, glMatrix) {
	function create(simulator, renderer, canvas) {
		var deferred = Q.defer();
		
		renderer.create(canvas).then(function(rend) {
			return simulator.create(rend).then(function(sim) {
				var graph = {
					"renderer": rend,
					"simulator": sim
				};
				graph.setPoints = setPoints.bind(this, graph);
				graph.setEdges = setEdges.bind(this, graph);
				graph.tick = tick.bind(this, graph);
				
				deferred.resolve(graph);
			})
		}).fail(function(err) {
			deferred.reject(err);
		});
		
		
		return deferred.promise;
	}
	
	
	function setPoints(graph, points) {
		var vels = _createVelocities(points);
		
		var floatPoints = _toFloat4(points, 500), floatVels = _toFloat4(vels, 0);
		
		return graph.simulator.setData(floatPoints, floatVels);
	}
	
	
	// For an array of points (vec4), generates an equal sized array of velocities (vec3)
	function _createVelocities(points) {
		var vels = [];
		
		points.forEach(function(point) {
			// Read r from the z component of the points vector, then set it to the value it should
			// really be, 500.
			var r = point[2];
			point[2] = 0;
			
			var vel = glMatrix.vec3.fromValues(point[0], point[1], point[2]);
			glMatrix.vec3.normalize(vel, vel);
			
			// rotate 90 ccwise
			var tmp = vel[0];
			vel[0] = - vel[1];
			vel[1] = tmp;
			
			
			glMatrix.vec3.scale(vel, vel, 20 * (r/0.5));
			
			vels.push(vel);
		});
		
		return vels;
	}
	
	
	function setEdges(graph, edges) {
		return Q.fcall(function() {
			return graph;
		});
	}
	
	
	// Turns an array of vec3's into a Float32Array with 4 values for each element in the input
	// array. The fourth value is set to 'w'.
	function _toFloat4(array, w) {
		var floats = new Float32Array(array.length * 4);
		
		for(var i = 0; i < array.length; i++) {
			var ii = i * 4;
			floats[ii + 0] = array[i][0];
			floats[ii + 1] = array[i][1];
			floats[ii + 2] = array[i][2];
			floats[ii + 3] = w;
		}
		
		return floats;
	}
	
	
	function tick(graph) {
		var startTime = Date.now();
		return graph.simulator.tick()
		.then(function() {
			var simTime = Date.now();
			console.debug("    Simulator took", simTime - startTime);
			return graph.renderer.render().then(function() {
				var renderTime = Date.now();
				console.debug("    Renderer took", renderTime - simTime)
				console.debug("Total time:", renderTime - startTime);
			})
		});
	}
	
	
	return {
		"create": create,
		"setPoints": setPoints,
		"setEdges": setEdges,
		"tick": tick
	};
});
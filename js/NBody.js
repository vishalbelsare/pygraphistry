define(["Q", "glMatrix"], function(Q, glMatrix) {
	var elementsPerPoint = 2;

	function create(simulator, renderer, canvas) {
		return renderer.create(canvas)
		.then(function(rend) {
			return simulator.create(rend).then(function(sim) {
				var graph = {
					"renderer": rend,
					"simulator": sim
				};
				graph.setPoints = setPoints.bind(this, graph);
				graph.setPointsImmediate = setPointsImmediate.bind(this, graph);
				graph.setEdges = setEdges.bind(this, graph);
				graph.tick = tick.bind(this, graph);

				deferred.resolve(graph);
			});
		});
	}


	function setPoints(graph, points) {
		var floatPoints = _toFloatArray(points);

		return graph.simulator.setData(floatPoints);
	}

	function setPointsImmediate(graph, buffer) {
	    return graph.simulator.setData(buffer);
	}


	function setEdges(graph, edges) {
		return Q.fcall(function() {
			return graph;
		});
	}


	// Turns an array of vec3's into a Float32Array with elementsPerPoint values for each element in
	// the input array.
	function _toFloatArray(array) {
		var floats = new Float32Array(array.length * elementsPerPoint);

		for(var i = 0; i < array.length; i++) {
			var ii = i * elementsPerPoint;
			floats[ii + 0] = array[i][0];
			floats[ii + 1] = array[i][1];
		}

		return floats;
	}


	function tick(graph) {
		return graph.simulator.tick()
		.then(function() {
			return graph.renderer.render();
		});
	}


	return {
		"elementsPerPoint": elementsPerPoint,
		"create": create,
		"setPoints": setPoints,
		"setPointsImmediate": setPointsImmediate,
		"setEdges": setEdges,
		"tick": tick
	};
});

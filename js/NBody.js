define(["Q", "glMatrix"], function(Q, glMatrix) {
	var elementsPerPoint = 2;

	/**
	 * Create a new N-body graph and return a promise for the graph object
	 *
	 * @param simulator - the module of the simulator backend to use
	 * @param renderer - the module of the rendering backend to use
	 * @param canvas - the canvas DOM element to draw the graph in
	 * @param [dimensions=\[1,1\]] - a two element array [width,height] used for internal posituin calculations.
	 */
	function create(simulator, renderer, canvas, dimensions, numSplits) {
		dimensions = dimensions || [1,1];
		numSplits = numSplits || 0;

		return renderer.create(canvas, dimensions)
		.then(function(rend) {
			return simulator.create(rend, dimensions).then(function(sim) {
				var graph = {
					"renderer": rend,
					"simulator": sim
				};
				graph.setPoints = setPoints.bind(this, graph);
				graph.setEdges = setEdges.bind(this, graph);
				graph.setPhysics = setPhysics.bind(this, graph);
				graph.tick = tick.bind(this, graph);
				graph.stepNumber = 0;				
				graph.dimensions = dimensions;
				graph.numSplits = numSplits;
				graph.events = {
					"simulateBegin": function() { },
					"simulateEnd": function() { },
					"renderBegin": function() { },
					"renderEnd": function() { },
					"tickBegin": function() { },
					"tickEnd": function() { }
				};

				return graph;
			});
		});
	}


	function setPoints(graph, points) {
		// FIXME: If there is already data loaded, we should to free it before loading new data
		if(!(points instanceof Float32Array)) {
			points = _toFloatArray(points);
		}

		graph.__pointsHostBuffer = points;

		graph.stepNumber = 0;
		return graph.simulator.setPoints(points)
		.then(function() {
			return graph;
		});
	}


	var setEdges = Q.promised(function(graph, rawEdges) {

        var edges = rawEdges;

		console.debug("Number of edges:", edges.length);

		if(edges.length < 1) {
			return Q.fcall(function() { return graph; });
		}

		// First, duplicate the edges array so that our kernels will modify both source and targets
		// edges_flipped = edges.slice(0);
		// // Flip the target/source nodes in this flipped array
		// for(var i = 0; i < edges_flipped.length; i++) {
		// 	var oldSource = edges_flipped[i][0];
		// 	edges_flipped[i][0] = edges_flipped[i][1];
		// 	edges_flipped[i][1] = oldSource;
		// }
		var edges_flipped = edges.map(function(val, idx, arr) {
			return [val[1], val[0]];
		});
		edges = edges.concat(edges_flipped);
		edges.sort(function(a, b) {
			if(a[0] < b[0]) {
				return -1;
			} else if(a[0] > b[1]) {
				return 1;
			} else {
				return 0;
			}
		})

		var workItems = [];

		var current_source = edges[0][0];
		var workItem = [0, 1];
		for(var i = 1; i < edges.length; i++) {
			if(edges[i][0] == current_source) {
				workItem[1]++;
			} else {
				workItems.push(workItem[0]);
				workItems.push(workItem[1]);
				current_source = edges[i][0];
				workItem = [i, 1];
			}
		}
		workItems.push(workItem[0]);
		workItems.push(workItem[1]);

		var edgesFlattened = edges.reduce(function(a, b) {
		    return a.concat(b);
		});

		var edgesTyped = new Uint32Array(edgesFlattened);
		var workItemsTypes = new Uint32Array(workItems);

		return graph.simulator.setEdges(edgesTyped, workItemsTypes)
		.then(function() {
			return graph;
		});
	});

	function setPhysics(graph, opts) {
	    graph.simulator.setPhysics(opts);
	    // TODO: Should we reset the stepNumber at the same time? It would allow our new forces to
	    // be applied at full-strength, rather than modulated by the current alpha value. However,
	    // it also means the forces will jump to higher values (due to the lower alpha) even if we
	    // decrease the physical forces a small bit.
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
		graph.events.tickBegin();

		// On the first tick, don't run the simulator so we can see the starting point of the graph
		// if(graph.stepNumber == 0) {
		// 	graph.events.renderBegin();
		// 	graph.stepNumber++

		// 	return graph.renderer.render()
		// 	.then(function() {
		// 		graph.events.renderEnd();
		// 		graph.events.tickEnd();

		// 		return graph;
		// 	});
		// } else {
			graph.events.simulateBegin();

			return graph.simulator.tick(graph.stepNumber++)
			.then(function() {
				graph.events.simulateEnd();
				graph.events.renderBegin();

				return graph.renderer.render();
			})
			.then(function() {
				graph.events.renderEnd();
				graph.events.tickEnd();

				return graph;
			});
		// }
	}


	return {
		"elementsPerPoint": elementsPerPoint,
		"create": create,
		"setPoints": setPoints,
		"setEdges": setEdges,
		"tick": tick
	};
});

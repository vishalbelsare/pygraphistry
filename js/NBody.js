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


	var setEdges = Q.promised(function(graph, edges) {

		console.debug("Number of edges:", edges.length);

		if (edges.length < 1)
			return Q.fcall(function() { return graph; });
		
		var edgesFlipped = edges.map(function(val, idx, arr) {
			return [val[1], val[0]];
		});

        function package(edgeList) {
        	edgeList.sort(function(a, b) {
			    return a[0] < b[0] ? -1 
			        : a[0] > b[0] ? 1
			        : a[1] - b[1];
			});

		    var workItems = [];
		    var current_source = edgeList[0][0];
		    var workItem = [0, 1];
            edgeList.forEach(function (edge, i) {
                if (i == 0) return;
                if(edge[0] == current_source) {
                    workItem[1]++;
                } else {
                    workItems.push(workItem[0]);
                    workItems.push(workItem[1]);
                    current_source = edge[0];
                    workItem = [i, 1];
                }
            });
			workItems.push(workItem[0]);
			workItems.push(workItem[1]);

            //Cheesey load balancing
            //TODO benchmark
            workItems.sort(function (edgeList1, edgeList2) { 
                return edgeList1.length - edgeList2.length;
            });

            var edgesFlattened = edges.reduce(function(a, b) { return a.concat(b); });

            return {
                edgesTyped: new Uint32Array(edgesFlattened),
                numWorkItems: workItems.length,
                workItemsTyped: new Uint32Array(workItems)
            };
        }

        var forwardEdges = package(edges);
        var backwardsEdges = package(edgesFlipped);

        var nDim = graph.dimensions.length;
		var midPoints = new Float32Array(edges.length * graph.numSplits * nDim || 1);
		if (graph.numSplits) {
		    edges.forEach(function (edge, i) {
		    	for (var d = 0; d < nDim; d++) {
		    		var start = graph.__pointsHostBuffer[edge[0] * nDim + d];
		    		var end = graph.__pointsHostBuffer[edge[1] * nDim + d];
		    		var step = (end - start) / (graph.numSplits + 1);
		    	    for (var q = 0; q < graph.numSplits; q++) {
		    	    	midPoints[(i * graph.numSplits + q) * nDim + d] = start + step * (q + 1);
		    		}
		    	}
		    });
		}
		console.debug('Number of control points:', edges.length * graph.numSplits);

		return graph.simulator.setEdges(forwardEdges, backwardsEdges, midPoints)
		.then(function() { return graph; });
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

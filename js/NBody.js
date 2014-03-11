define(["Q", "glMatrix"], function(Q, glMatrix) {
    'use strict';

	var STEP_NUMBER_ON_CHANGE = 30;

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
			return simulator.create(rend, dimensions, numSplits).then(function(sim) {
				var graph = {
					"renderer": rend,
					"simulator": sim
				};
				graph.setPoints = setPoints.bind(this, graph);
				graph.setEdges = setEdges.bind(this, graph);
				graph.setPhysics = setPhysics.bind(this, graph);
				graph.setVisible = setVisible.bind(this, graph);
				graph.setLocked = setLocked.bind(this, graph);
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
			points = _toTypedArray(points, Float32Array);
		}

		graph.__pointsHostBuffer = points;

		graph.stepNumber = 0;
		return graph.simulator.setPoints(points)
		.then(function() {
			return graph;
		});
	}


	var setEdges = Q.promised(function(graph, edges) {

		if (edges.length < 1)
			return Q.fcall(function() { return graph; });

		if (!(edges instanceof Uint32Array)) {
			edges = _toTypedArray(edges, Uint32Array);
		}

		console.debug("Number of edges:", edges.length / 2);

		var edgesFlipped = new Uint32Array(edges.length);
		for (var i = 0; i < edges.length; i++)
			edgesFlipped[i] = edges[edges.length - 1 - i];

        function encapsulate(edges) {

        	var edgeList = new Array(edges.length / 2);
        	for (var i = 0; i < edges.length; i++)
        		edgeList[i / 2] = [edges[i], edges[i + 1]];

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

            var edgesFlattened = new Uint32Array(edges.length);
            for (var i = 0; i < edgeList.length; i++) {
            	edgesFlattened[2 * i] = edgeList[i][0];
            	edgesFlattened[2 * i + 1] = edgeList[i][1];
            }

            return {
                edgesTyped: edgesFlattened,
                numWorkItems: workItems.length,
                workItemsTyped: new Uint32Array(workItems)
            };
        }

        var forwardEdges = encapsulate(edges);
        var backwardsEdges = encapsulate(edgesFlipped);

        var nDim = graph.dimensions.length;
		var midPoints = new Float32Array((edges.length / 2) * graph.numSplits * nDim || 1);
		if (graph.numSplits) {
			for (var i = 0; i < edges.length; i+=2) {
				var src = edges[i];
				var dst = edges[i + 1];
		    	for (var d = 0; d < nDim; d++) {
		    		var start = graph.__pointsHostBuffer[src * nDim + d];
		    		var end = graph.__pointsHostBuffer[dst * nDim + d];
		    		var step = (end - start) / (graph.numSplits + 1);
		    	    for (var q = 0; q < graph.numSplits; q++) {
		    	    	midPoints[(i * graph.numSplits + q) * nDim + d] = start + step * (q + 1);
		    		}
		    	}
		    }
		}
		console.debug('Number of control points:', edges.length * graph.numSplits, graph.numSplits);

		return graph.simulator.setEdges(forwardEdges, backwardsEdges, midPoints)
		.then(function() { return graph; });
	});

	function setPhysics(graph, opts) {
		graph.stepNumber = STEP_NUMBER_ON_CHANGE;
	    graph.simulator.setPhysics(opts, graph.stepNumber);
	}

	function setVisible(graph, opts) {
		graph.renderer.setVisible(opts);
	}

	function setLocked(graph, opts) {
		//TODO reset step number?
		graph.simulator.setLocked(opts, graph.stepNumber);
	}

	// Turns an array of vec3's into a Float32Array with elementsPerPoint values for each element in
	// the input array.
	function _toTypedArray(array, cons) {
		var floats = new cons(array.length * elementsPerPoint);

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

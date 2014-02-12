require.config({
	paths: {
		"jQuery": "libs/jquery-2.1.0",
		"Q": "libs/q",
		"glMatrix": "libs/gl-matrix",
		"MatrixLoader": "libs/load",
		"Bootstrap": "libs/bootstrap",
		"Stats": "libs/stats.beautified"
	},
	shim: {
		"jQuery": {
			exports: "$"
		},
		"Stats": {
			exports: "Stats"
		}
	}
});

require(["jQuery", "NBody", "RenderGL", "SimCL", "MatrixLoader", "Q", "Stats"],
function($, NBody, RenderGL, SimCL, MatrixLoader, Q, Stats) {
	Q.longStackSupport = true;

	var graph = null,
		animating = null,
		numPoints = 16384, //16384
		dimensions = [1,1]; //[960,960];


	// Given a set of graph data, load the points into the N-body simulation
	function drawGraph (clGraph, graphFile) {
		var t0 = new Date().getTime();

		var check = {};
		var count = 0;
		for (var i = 0; i < graphFile.edges.length; i++) {
			var node = graphFile.edges[i];
			if (!check[node]) {
				check[node] = true;
				count++;
			}
		}

		var t1 = new Date().getTime();

		var buff = new Float32Array(count * 2);
		var count2 = 0;
		for (var v in check) {
			buff[count2++] = Math.random() * clGraph.dimensions[0];
			buff[count2++] = Math.random() * clGraph.dimensions[1];
		}

		var t2 = new Date().getTime();
		// console.log('toNodes', t1 - t0, 'ms', 'toFloats', t2 - t1, 'ms', 'nodes', count2);

		return clGraph.setPoints(buff)
		.then(function() {
			return clGraph.tick();
		});

		//console.log(buff);
    }


    function loadMatrices(clGraph) {
        function fileNfo (file) {
          return {
            base: file.f.split(/\/|\./)[file.f.split(/\/|\./).length - 3],
			size: file.KB > 1000 ? (Math.round(file.KB / 1000) + " MB") : (file.KB + " KB")
		  };
        }

		var files = MatrixLoader.ls("data/matrices.binary.json");
		files.then(function (files) {
		  var options = files.map(function (file, i) {
		    var nfo = fileNfo(file);
			return $('<option></option>')
			  .attr('value', i)
			  .text(nfo.base + " (" + nfo.size + ")");
		  });
		  $('#datasets')
		    .append(options)
		    .on('change', function () {
		      var file = files[parseInt(this.value)];
			  var graphFile = MatrixLoader.loadBinary(file.f);
			  graphFile.then(function (v) {
			    // console.log('got', v);
				$('#filenodes').text('Nodes: ' + v.numNodes);
				$('#fileedges').text('Edges: ' + v.numEdges);
		      });
			  Q.promised(drawGraph)(clGraph, graphFile);
		    });
		});

		return files;
    }


	function animatePromise(promise) {
		return promise()
		.then(function() {
			if(animating){
				animId = window.setTimeout(function() {
					animatePromise(promise);
				}, 0);

				return animId;
			} else {
				return null;
			}
		}, function(err) {
			console.error("Error during animation:", err);
		});
	}


	function stopAnimation() {
		animating = false;
	}


	function setup() {
		console.log("Running Naive N-body simulation");

		return NBody.create(SimCL, RenderGL, $("#simulation")[0], dimensions)
		.then(function(createdGraph) {
			graph = createdGraph;
			console.log("N-body graph created.");

			var points = createPoints(numPoints, dimensions);

			var fpsTotal = new Stats();
			fpsTotal.setMode(0);
			$("#fpsTotal").append(fpsTotal.domElement);
			graph.events.tickBegin = function() { fpsTotal.begin(); };
			graph.events.tickEnd = function() { fpsTotal.end(); };

			var fpsSim = new Stats();
			fpsSim.setMode(1);
			$("#fpsSim").append(fpsSim.domElement);
			graph.events.simulateBegin = function() { fpsSim.begin(); };
			graph.events.simulateEnd = function() { fpsSim.end(); };

			var fpsRender = new Stats();
			fpsRender.setMode(1);
			$("#fpsRender").append(fpsRender.domElement);
			graph.events.renderBegin = function() { fpsRender.begin(); };
			graph.events.renderEnd = function() { fpsRender.end(); };

			var fpsKernel = new Stats();
			fpsKernel.setMode(1);
			$("#fpsKernel").append(fpsKernel.domElement);
			graph.simulator.events.kernelStart = function() { fpsKernel.begin(); };
			graph.simulator.events.kernelEnd = function() { fpsKernel.end(); };

			return graph.setPoints(points);
		})
		.then(function() {
			var animButton = $("#anim-button");
			var stepButton = $("#step-button");

			function startAnimation() {
				animating = true;
				animButton.text("Stop");
				stepButton.prop("disabled", true);

				animButton.on("click", function() {
					stopAnimation();
					stepButton.prop("disabled", false);
					animButton.text("Animate");
					animButton.on("click", startAnimation);
				});

				animatePromise(graph.tick);
			}
			animButton.on("click", startAnimation);

			stepButton.on("click", function() {
				if(animating) {
					return false;
				}

				stepButton.prop("disabled", true);

				graph.tick()
				.then(function() {
					stepButton.prop("disabled", false);
				})
			});

			animButton.prop("disabled", false);
			stepButton.prop("disabled", false);

			return graph.tick();
		});
	}


	// Generates `amount` number of random points
	function createPoints(amount, dim) {
		// Allocate 2 elements for each point (x, y)
		var points = [];

		// points.push([0.5, 0.5]);
		// points.push([0.5, 0.5]);
		// // points.push([0.5, 0.5]);

		// points.push([0.2, 0.2]);
		// points.push([0.1, 0.1]);
		// points.push([0.9, 0.1]);
		// points.push([0.9, 0.9]);
		// points.push([0.1, 0.9]);
		// points.push([0.5, 0.5]);

		for(var i = 0; i < amount; i++) {
			points.push([Math.random() * dim[0], Math.random() * dim[1]]);
		}

		return points;
	}

	function bindSliders(graph) {
	  $('#charge').on('change', function (e) {
	    var v = $(this).val();
	    var res = 0.1;
	    for (var i = 0; i < (100-v); i++) res /= 1.3;
	    var scaled = -1 * res;
	    console.log('charge', v, '->', scaled);
	    graph.setPhysics({charge: scaled});
	  });
	  $('#gravity').on('change', function (e) {
	    var v = $(this).val();
	    var res = 100.0;
	    for (var i = 0; i < (100-v); i++) res /= 1.3;
	    var scaled = 1 * res;
	    console.log('gravity', v, '->', scaled);
	    graph.setPhysics({gravity: scaled});
	  });
	}


	setup().
	then(function() {
		return loadMatrices(graph);
	}, function(err) {
		console.error("Error setting up animation:", err);
	}).then(function () {
	    return bindSliders(graph);
	});
});
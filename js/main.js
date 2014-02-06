require.config({
	paths: {
		"jQuery": "libs/jquery-2.1.0",
		"Q": "libs/q",
		"glMatrix": "libs/gl-matrix",
		"MatrixLoader": "libs/load"
	},
	shim: {
		"jQuery": {
			exports: "$"
		}
	}
});

require(["jQuery", "NBody", "glMatrix", "RenderGL", "SimCL", "MatrixLoader", "Q"],
	function($, NBody, glMatrix, RenderGL, SimCL, MatrixLoader, Q) {
	var graph = null,
		animId = null;


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
			buff[count2++] = v / count;
			buff[count2++] = count2 / count;
		}

		var t2 = new Date().getTime();
		console.log('toNodes', t1 - t0, 'ms', 'toFloats', t2 - t1, 'ms', 'nodes', count2);

		clGraph.setPointsImmediate(buff);

		//console.log(buff);
    }


    function loadMatrices(clGraph) {
		var files = MatrixLoader.ls("data/matrices.binary.json");
		files.then(function (files) {
			$('#matrices').append(
				files.map(function (file) {
					var base = file.f.split(/\/|\./)[file.f.split(/\/|\./).length - 3]
					var size = file.KB > 1000 ? (Math.round(file.KB / 1000) + " MB") : (file.KB + " KB");
					var link = $("<a></a>")
					.attr("href", "javascript:void(0)")
					.text(base + " (" + size + ")")
					.click(function () {
						$('#filename').text(base);
						$('#filesize').text(size);
						var graphFile = MatrixLoader.loadBinary(file.f);
						graphFile.then(function (v) {
							console.log('got', v);
							$('#filenodes').text(v.numNodes);
							$('#fileedges').text(v.numEdges);
							$('#fileedgelist').text(
								Array.prototype.slice.call(v.edges, 0, 3)
								.map(function (_, i) {
								return '(' + v.edges[2 * i] + ',' + v.edges[2 * i + 1] + ')'; })
								.join(' '));
						});
						Q.promised(drawGraph)(clGraph, graphFile);
					});
					return $('<li></li>').append(link);
			}));
		});
    }


	function animatePromise(promise) {
		if(animId == null) {
			return promise.then(function() {
				animId = window.requestAnimationFrame(function() {
					animatePromise(promise);
				});
				return animId;
			});
		} else {
			return Q.promised(function() { return animId; });
		}
	}


	function stopAnimation() {
		if(animId != null) {
			window.cancelAnimationFrame(animationId);
			animId = null;
		}
	}


	function setup() {
		console.log("Running Naive N-body simulation");

		return NBody.create(SimCL, RenderGL, $("#simulation")[0])
		.then(function(createdGraph) {
			graph = createdGraph;
			console.log("N-body graph created.");

			var points = createPoints(4096);
			return graph.setPoints(points);
		})
		.then(function() {
			var button = $("#step-button");

			button.on("click", function() {
				button.text("Stop");

				button.on("click", function() {
					button.text("Animate");
					button.on("click", stopAnimation);
				});

				animatePromise(graph.tick());
			});

			button.prop("disabled", false);

			return graph;
		}, function(err) {
			console.err("Fatal error trying to setup graph:", err);
		});
	}


	// Generates `amount` number of random points
	function createPoints(amount) {
		// Allocate 2 elements for each point (x, y)
		var points = [];

		points.push([0.5, 0.5]);
		// points.push([0.1, 0.1]);
		// points.push([0.9, 0.1]);
		// points.push([0.9, 0.9]);
		points.push([0.1, 0.9]);

		return points;
	}


	setup();
	loadMatrices(graph);
});
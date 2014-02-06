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
	function drawGraph (clGraph, graphData) {
		console.log('drawing', clGraph, graphData);
		var points = graphData.nodes.map(function (node, i) {
		return [node.index / graphData.nodes.length, i / graphData.nodes.length, 0];
		});
		clGraph.setPoints(points);
	}


	// Load the index of all the matrices we know about, and create links on the page to load each
	// of them
	function loadMatrices(clGraph) {
		var files = MatrixLoader.ls("data/matrices.json");
		files.then(function (files) {
		$('#matrices').append(
			files
			.map(function (file) {
				var base = file.f.split(/\/|\./)[1]
				var size = file.KB > 1000 ? (Math.round(file.KB / 1000) + " MB") : (file.KB + " KB");
				var link = $("<a></a>")
				.attr("href", "javascript:void(0)")
				.text(base + " (" + size + ")")
				.click(function () {
					$('#filename').text(base);
					$('#filesize').text(size);
					var graphData = MatrixLoader.load(file.f);
					graphData.then(function (v) {
					console.log('got', v);
					$('#filenodes').text(v.nodes.length);
					$('#fileedges').text(v.links.length);
					$('#fileedgelist').text(
						v.links
						.slice(0, 20)
						.map(function (pair) {
							return '(' + pair.source.index + ',' + pair.target.index + ')'; })
						.join(' '));
					});
					Q.promised(drawGraph)(clGraph, graphData);
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
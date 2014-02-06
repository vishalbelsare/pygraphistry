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
		animating = null;


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

		clGraph.setPoints(buff);

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
		return promise()
		.then(function() {
			if(animating){
				animId = window.requestAnimationFrame(function() {
					animatePromise(promise);
				});

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

		return NBody.create(SimCL, RenderGL, $("#simulation")[0])
		.then(function(createdGraph) {
			graph = createdGraph;
			console.log("N-body graph created.");

			var points = createPoints(4096);
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
	function createPoints(amount) {
		// Allocate 2 elements for each point (x, y)
		var points = [];

		points.push([0.5, 0.5]);
		points.push([0.5, 0.5]);
		// points.push([0.1, 0.1]);
		// points.push([0.9, 0.1]);
		// points.push([0.9, 0.9]);
		points.push([0.1, 0.9]);

		return points;
	}


	setup().
	then(function() {
		loadMatrices(graph);
	}, function(err) {
		console.error("Error setting up animation:", err);
	});
});
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
  
    function drawGraph (clGraph, graph) {

      var all = [];
      var check = {};
      for (var i = 0; i < graph.edges.length; i++) {
        var node = graph.edges[i];
        if (!check[node]) {
          check[node] = true;
          all.push(node);
        }
      }

      var buff = new Float32Array(all.length * 2);
      for (var i = 0; i < all.length ; i++) {
        buff[2 * i] = all[i] / all.length;
        buff[2 * i + 1] = i / all.length;
      }
      clGraph.setPointsImmediate(buff);
      
      //console.log(buff);
    }  
    
    function loadMatrices(clGraph) {
      var files = MatrixLoader.ls("data/matrices.binary.json");
      files.then(function (files) {
        $('#matrices').append(
          files
            .map(function (file) {
              var base = file.f.split(/\/|\./)[file.f.split(/\/|\./).length - 3]
              var size = file.KB > 1000 ? (Math.round(file.KB / 1000) + " MB") : (file.KB + " KB");
              var link = $("<a></a>")
                .attr("href", "javascript:void(0)")
                .text(base + " (" + size + ")")
                .click(function () {
                  $('#filename').text(base);
                  $('#filesize').text(size);              
                  var graph = MatrixLoader.loadBinary(file.f);
                  graph.then(function (v) {             
                    console.log('got', v);
                    $('#filenodes').text(v.numNodes);        
                    $('#fileedges').text(v.numEdges);
                    $('#fileedgelist').text(
                      Array.prototype.slice.call(v.edges, 0, 3)
                        .map(function (_, i) { 
                          return '(' + v.edges[2 * i] + ',' + v.edges[2 * i + 1] + ')'; })
                        .join(' '));
                                            
                  });
                  Q.promised(drawGraph)(clGraph, graph);
                });
              return $('<li></li>').append(link);
            }));
      });
    }
  
	function run() {
		console.log("Running Naive N-body simulation");
		
		var points = createPoints(4096);

		var graph = NBody.create(SimCL, RenderGL, $("#simulation")[0])
		graph.then(function(graph) {
			console.log("N-body graph created.");
			
			graph.setPoints(points)
			.then(function() {
				var button = $("#step-button");
				var animationId = null;
				var lastFrameTime = Date.now();
				var frameTimer = Date.now();
				var frames = 0;
				
				function startAnimation() {
					button.text("Stop");
					button.on("click", stopAnimation);
					frameTimer = Date.now();
					lastFrameTime = Date.now();
					
					function runAnimation() {
						if(animationId === null) {
							return;
						}
												
						graph.tick().then(function() {
							frames++;
							var currentFrameTime = Date.now();
							
							if(frames % 100 === 0) {
								var newFrameTimer = Date.now();
								console.debug("FPS:", (newFrameTimer - frameTimer)/100);
								frameTimer = newFrameTimer;
							}
							
							if(frames > 2 && currentFrameTime - lastFrameTime > 5000) {
								console.error("Peformance seems to be dying. Disabling animation.")
								lastFrameTime = currentFrameTime;
								stopAnimation();
							}
							// else if(frames > 100) {
							// 	console.log("Ran 100 frames. Stopping.");
							// 	lastFrameTime = currentFrameTime;
							// 	stopAnimation();
							// }
							else {
								lastFrameTime = currentFrameTime;
								animationId = window.requestAnimationFrame(runAnimation);
							}
						}, function(err) {
							console.error("Could not execute a tick. Error:", err);
						})
					}
					
					animationId = window.requestAnimationFrame(runAnimation);
				}
				
				function stopAnimation() {
					window.cancelAnimationFrame(animationId);
					animationId = null;
					button.text("Start");
					button.on("click", startAnimation);
				}
				
				button.on("click", startAnimation);
				button.prop("disabled", false);				
				
				return graph;
			}, function(err) {
				console.error("Error creating N-body graph:", err.message);
				console.error(err);
			});
		});
		return graph;
	}
	
	
	// Generates `amount` number of random points
	function createPoints(amount) {
		// Allocate 2 elements for each point (x, y)
		var points = [];
		
		points.push([0.5, 0.5]);
		points.push([0.1, 0.1]);
		points.push([0.9, 0.1]);
		points.push([0.9, 0.9]);
		points.push([0.1, 0.9]);
				
		return points;
	}
	
	
	var graph = run();
	loadMatrices(graph);
});
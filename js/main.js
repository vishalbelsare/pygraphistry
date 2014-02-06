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
      console.log('drawing', clGraph, graph);
      var points = graph.nodes.map(function (node, i) {
        return [node.index / graph.nodes.length, i / graph.nodes.length, 0];        
      });
      clGraph.setPoints(points);      
    }  
    
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
                  var graph = MatrixLoader.load(file.f);
                  graph.then(function (v) {             
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
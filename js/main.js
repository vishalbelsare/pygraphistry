require.config({
	paths: {
		"jQuery": "libs/jquery-2.1.0",
		"Q": "libs/q",
		"glMatrix": "libs/gl-matrix"
	},
	shim: {
		"jQuery": {
			exports: "$"
		}
	}
});


require(["jQuery", "NBody", "glMatrix", "RenderGL", "SimCL"], function($, NBody, glMatrix, RenderGL, SimCL){
	function run() {
		console.log("Running Naive N-body simulation");
		
		var points = createPoints(4096);

		NBody.create(SimCL, RenderGL, $("#simulation")[0])
		.then(function(graph) {
			console.log("N-body graph created.");
			
			return graph.setPoints(points)
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
				
			}, function(err) {
				console.error("Error creating N-body graph:", err.message);
				console.error(err);
			});
		});
	}
	
	
	// Generates `amount` number of random points
	function createPoints(amount) {
		// Allocate 4 bytes for each point (x, y, z, w)
		var points = [];
		
		points.push([0.5, 0.5, 0]);
		points.push([0.1, 0.1, 0]);
		points.push([0.9, 0.1, 0]);
		points.push([0.9, 0.9, 0]);
		points.push([0.1, 0.9, 0]);
				
		return points;
	}
	
	
	run();
});
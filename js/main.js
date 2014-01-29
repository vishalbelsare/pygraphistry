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
		
		var points = createPoints(100);

		NBody.create(SimCL, RenderGL, $("#simulation")[0])
		.then(function(graph) {
			console.log("N-body graph created.");
			
			return graph.setPoints(points)
			.then(function() {
				var button = $("#step-button");
				var clicks = 0;
				
				button.on("click", function() {
					graph.tick().then(function(){
						clicks++;
						console.log("" + clicks + " tick(s) executed")
					}, function(err) {
						console.error("Could not execute a tick. Error:", err);
					});
				});
				
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
		
		for(var i = 0; i < amount; i++) {
			var r = 0.5 * Math.random();
			var theta = 2 * Math.PI * Math.random();
			
			// We want the z component to be 500, but we also need r when calculating the,
			// velocities. So set z = r here, then read it back when creating velocities before
			// setting it to 0.
			points.push([r * Math.sin(theta), r * Math.cos(theta), r]);
		}
		
		return points;
	}
	
	
	run();
});
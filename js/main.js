require.config({
	paths: {
		"jQuery": "libs/jquery-2.1.0",
		"Q": "libs/q"
	},
	shim: {
		"jQuery": {
			exports: "$"
		}
	}
});


require(["jQuery", "NBody", "RenderGL", "SimCL"], function($, NBody, RenderGL, SimCL){
	console.log("Running Naive N-body simulation");
	
	var canvas = $("#simulation");
	
	NBody.create(SimCL, RenderGL, canvas[0]).then(function() {
			console.log("N-body graph created.");
		}).fail(function(err) {
			console.error("Error creating N-body graph:", err.message);
			console.error(err);
		});
});
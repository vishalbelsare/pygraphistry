define(["Q"], function(Q) {	
	function create(simulator, renderer, canvas) {
		var nbody = {},
		    deferred = Q.defer();
		
		renderer.create(canvas).then(function(render) {
			return simulator.create(render).then(function(sim) {
				deferred.resolve(nbody);
			})
		}).fail(function(err) {
			deferred.reject(err);
		});
		
		
		return deferred.promise;
	}
	
	
	return {
		"create": create,
	};
});
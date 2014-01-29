define(["Q", "util", "cl"], function(Q, util, cljs) {
	function _init(sim) {
		
	}
	
	function create(renderer) {
		var sim = {}, 
		    deferred = Q.defer();
		    
		cljs.create(renderer.gl)
		.then(function(cl) {
			return util.getSource("cl-nbody")
			.then(function(source) {
				return cljs.compile(cl, source, "nbody_kernel_GPU");
			})
			.then(function(kernel) {
				return sim;
			});
		}).then(function(sim) {
			deferred.resolve(sim);
		}, function(err) {
			deferred.reject(err);
		});
		
		return deferred.promise;
	}
	
	
	return {
		"create": create
	};
});
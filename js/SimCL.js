define(["Q"], function(Q) {
	function create(renderer) {
		var sim = {}, 
		    deferred = Q.defer();
		
		deferred.resolve(sim)
		
		return deferred.promise;
	}
	
	
	return {
		"create": create
	};
});
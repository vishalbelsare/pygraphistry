//kmeans
// [ [ float ]_r ]_p * int==k * int -> 
// {labeling: [ int <= k ]_p, centers: [ [ float ]_r ]_k, assignments: [ [ {row: int, dist: float}] ]_k}

function kmeans (data, k, maxSteps) {
	if (k > data.length) throw 'k must be less than rank';
	
	//grab k random rows		
	// [ [float] ]_(m>k) * k:int -> [ [float] ]_k
	// TODO k++ initializer
	function init (data, k) { 
		var opts = [];
		for (var i = 0; i < data.length; i++) opts.push(i);
	
		var rows = [];
		for (var i = 0; i < k; i++)
			rows.push(opts.splice(Math.round(Math.random() * opts.length),1));
		
		return rows.map(function (idx) { return data[idx]; });	
	}
	
	//euclidean: sqrt of sum of squares
	// [ float ]_k * [ float ]_k -> float
	function dist (row, center) { 
		var sum = 0;
		for (var i = 0; i < row.length; i++)
			sum += Math.pow(row[i] - center[i], 2);
		return Math.sqrt(sum);
	}
	
	//closest cluster
	// [ float ]_r * [ [ float ]_r ]_k -> int
	function assign (row, centers) { 
		var center = 0;
		var score = dist(row, centers[0]);
		for (var i = 1; i < centers.length; i++) {
			var attempt = dist(row, centers[i]);
			if (attempt < score) {
				center = i;
				score = attempt;
			}
		}
		return {cluster: center, score: score};
	}
	
	// relabel points and return whether any changed
	// [ _ ]_p * [ [ float ]_r ]_p * [ [ float ]_r ]_k -> {anyChanged: bool, clustering: [ [{row: int, dist: float}] ]_k
	function assignAll (labeling, rows, centers) {

		var anyChanged = false;
		var assignments = [];
		for (var i = 0; i < centers.length; i++) assignments.push([]);
		
		for (var p = 0; p < rows.length; p++) {
			var before = labeling[p];
			var assignment = assign(rows[p], centers);
			if (assignment.cluster != before) {
				anyChanged = true;
				labeling[p] = assignment.cluster; 
			}
			assignments[assignment.cluster].push({row: p, dist: assignment.score});
		}
		return {anyChanged: anyChanged, clustering: assignments}
	}
	
	//update cluster k
	//return whether a value changed
	// [ int <= k ]_p * [ [ float ]_r ]_k * [ [ float ]_r ]_p * int<=k -> bool
	function recenterCluster (labeling, centers, data, k) {
		var anyChanged = false;
		var numHits = 0;
		for (var i = 0; i < labeling.length; i++) {
			if (labeling[i] == k) numHits++;
		}
		if (!numHits) {
			for (var f = 0; f < centers[0].length; f++) {
				var before = centers[k][f];
				centers[k][f] = 0;
				anyChanged |= before != 0;
			}
			return anyChanged;			
		} else {
			for (var f = 0; f < centers[0].length; f++) {
				var before = centers[k][f];
				var sum = 0;
				for (var p = 0; p < labeling.length; p++)
					if (labeling[p] == k)
						sum += data[p][f];
				var newCenter = sum / numHits;
				centers[k][f] = newCenter;
				anyChanged |= before == newCenter;
			}
			return anyChanged;
		}		
	} 
	
	//update clusters
	//return whether any values changed
	// [ int <= k ]_p * [ [ float ]_r ]_k * [ [ float ]_r ]_p -> bool
	function recenterClusters (labeling, centers, data) {
		var anyChanged = false;
		for (var k = 0; k < centers.length; k++)
			anyChanged |= recenterCluster(labeling, centers, data, k);
		return anyChanged;
	}
	
	var centers = init(data,k);
	var labeling = new Array(data.length);
	for (var i = 0; i < data.length; i++) labeling[i] = 0;
	
	for (var i = 0; i < maxSteps; i++) {
//		console.error('10 labels', labeling.slice(0,10));		
//		console.error('3 centers', [].concat.apply([],centers.slice(0,3).map(function (row) { return row.slice(0,2); })));
		var assignments = assignAll(labeling, data, centers);
//		console.error(assignments.clustering.slice(0,3));
		var assignChange = assignments.anyChanged;
		var clusterChange = recenterClusters(labeling, centers, data);		
		var anyChanged = assignChange || clusterChange; 
//		console.error('change', i, assignChange, clusterChange);
		if (!anyChanged) {
			break;
		}
	}

	var assignments = assignAll(labeling, data, centers); //under most recent clustering
	return {labeling: labeling, centers: centers, assignments: assignments.clustering};
}
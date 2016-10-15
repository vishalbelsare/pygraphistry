var data = {
    edges: [],
    nodes: []
};

function removeFromArray(array, value) {
	var idx = array.indexOf(value);
	if (idx !== -1) {
		array.splice(idx, 1);
	}
	return array;
}

function addEdges(newEdges) {
    data.edges = data.edges.concat(newEdges);
}

function addNodes(newNodes) {
    data.nodes = data.nodes.concat(newNodes);
}

function removeEdges(removedEdges) {
    removedEdges.map(function(removedEdge) {
        data.edges = removeFromArray(data.edges, removedEdge);
    })
}

function removeNodes(removedNodes) {
    removedNodes.map(function(removedNode) {
        data.nodes = removeFromArray(data.nodes, removedNode);
    })
}

function getData() {
    return data;
}

export default {
    addEdges, addNodes, removeEdges, removeNodes, getData
}



import { assert } from 'chai';

import { shapeSplunkResults } from '../../src/shared/services/shapeSplunkResults';


function compareGraph(pivot, expectedResults, done) {

		const out = shapeSplunkResults({ 
			pivot: {
				...pivot,
				template: pivot.template || {}
			}
		});

		assert.deepEqual(out.pivot.results, expectedResults);

		done();	

}


describe('shapeSplunkResults', function() {

	it('hypergraph empty', (done) => {

		const pivot = { events: [] };
		const expected = { graph: [], labels: [] };

		compareGraph(pivot, expected, done);
	});

	it('hypergraph single', function (done) {

		const pivot = { events: [{'EventID': 'xx', 'y': 'z'}] };
		const expected = {
			graph: [
				{'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z'}
			], 
			labels: [
				{'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
				{'node': 'z', 'type': 'y'}
			]
		};

		compareGraph(pivot, expected, done);
	});

	it('graph empty', (done) => {

		const pivot = { graph: { nodes: [], edges: [] } };
		const expected = { graph: [], labels: [] };

		compareGraph(pivot, expected, done);
	});

	it('graph only nodes', (done) => {

		const pivot = { graph: { nodes: [{x: 1}, {y: 'a'}], edges: [] } };
		const expected = { labels: pivot.graph.nodes, graph: [] };

		compareGraph(pivot, expected, done);
	});

	it('graph only edges', (done) => {

		const pivot = { graph: { nodes: [], edges: [ {source: 'x', destination: 'y'} ]}};
		const expected = { labels: [], graph: pivot.graph.edges };

		compareGraph(pivot, expected, done);
	});

	it('graph nodes+edges', (done) => {

		const pivot = { graph: { nodes: [ { node: 'x', a: 'b'} ], edges: [ { source: 'x', destination: 'y'} ]}};
		const expected = { labels: pivot.graph.nodes, graph: pivot.graph.edges };

		compareGraph(pivot, expected, done);
	});

	it('hypergraph + graph', (done) => {

		const pivot = {
			graph: {
				nodes: [ {node: 'x', a: 'b'} ], 
				edges: [ {source: 'x', destination: 'y'} ]},
			events: [ {'EventID': 'xx', 'y': 'z'} ]
		};
		const expected = { 
			graph: [
				{'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z'},
				{source: 'x', destination: 'y'}
			], 
			labels: [
				{'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
				{'node': 'z', 'type': 'y'},
				{node: 'x', a: 'b'}
			]
		};

		compareGraph(pivot, expected, done);

	});

});
        
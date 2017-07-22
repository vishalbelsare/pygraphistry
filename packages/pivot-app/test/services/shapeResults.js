import { assert } from 'chai';

import { shapeResults } from '../../src/shared/services/shapeResults';


function compareGraph(pivot, expectedResults, done) {

        const out = shapeResults({ 
            pivot: {
                ...pivot,
                template: pivot.template || {}
            }
        });

        assert.deepEqual(out.pivot.results, expectedResults);

        done(); 

}


describe('shapeResults', function() {

    it('hypergraph empty', (done) => {

        const pivot = { events: [] };
        const expected = { graph: [], labels: [] };

        compareGraph(pivot, expected, done);
    });

    it('hypergraph single', function (done) {

        const pivot = { events: [{'EventID': 'xx', 'y': 'z'}] };
        const expected = {
            graph: [
                {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
            ], 
            labels: [
                {'node': 'xx', 'EventID': 'xx', 'type': 'EventID', 'y': 'z'}, 
                {'node': 'z', 'type': 'y'}
            ]
        };

        compareGraph(pivot, expected, done);
    });

    it('hypergraph skips nulls', function (done) {

        const pivot = { events: [{'EventID': 'xx', 'y': 'z', 'a': null, 'b': undefined}] };
        const expected = {
            graph: [
                {'source': 'xx', 'destination': 'z', 
                 'a': null,
                 'EventID': 'xx', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
            ], 
            labels: [
                {'node': 'xx', 'EventID': 'xx', 'type': 'EventID', 'y': 'z', 'a': null}, 
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
                {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'},
                {source: 'x', destination: 'y'}
            ], 
            labels: [
                {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                {'node': 'z', 'type': 'y'},
                {node: 'x', a: 'b'}
            ]
        };

        compareGraph(pivot, expected, done);

    });

    describe('attributes', () => {

        describe('generation', () => {

             it('accepts empty', (done) => {

                const pivot = { 
                    events: [{'EventID': 'xx', 'y': 'z'}],
                    connections: ['y'],
                    attributes: undefined 
                };
                const expected = {
                    graph: [
                        {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y'}
                    ]
                };

                compareGraph(pivot, expected, done);
            });

            it('accepts lists', (done) => {

                const pivot = { 
                    events: [{'EventID': 'xx', 'y': 'z', 'a': 'b', 'c': 'd'}],
                    connections: ['y'],
                    attributes: ['fake', 'y'] 
                };
                const expected = {
                    graph: [
                        {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y'}
                    ]
                };

                compareGraph(pivot, expected, done);
            });

        });

        describe('blacklisting', () => {

            it('accepts empty', (done) => {

                const pivot = { 
                    events: [{'EventID': 'xx', 'y': 'z'}],
                    attributesBlacklist: undefined
                };
                const expected = {
                    graph: [
                        {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y'}
                    ]
                };

                compareGraph(pivot, expected, done);

            });

            it('accepts lists', (done) => {

                const pivot = { 
                    events: [{'EventID': 'xx', 'y': 'z'}],
                    attributesBlacklist: ['y', 'fake']
                };
                const expected = {
                    graph: [
                        {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID'}, 
                        {'node': 'z', 'type': 'y'}
                    ]
                };

                compareGraph(pivot, expected, done);

            });

        });
    });

    describe('entities', () => {
        describe('generation', () => {

            it('accepts empty', (done) => {

                const pivot = { 
                    events: [{'EventID': 'xx', 'y': 'z'}],
                    connections: undefined 
                };
                const expected = {
                    graph: [
                        {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y'}
                    ]
                };

                compareGraph(pivot, expected, done);
            });

            it('accepts lists', (done) => {

                const pivot = { 
                    events: [{'EventID': 'xx', 'y': 'z', 'a': 'b', 'c': 'd'}],
                    connections: ['fake', 'y'] 
                };
                const expected = {
                    graph: [
                        {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z', 'a': 'b', 'c': 'd'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z', 'a': 'b', 'c': 'd'}, 
                        {'node': 'z', 'type': 'y'}
                    ]
                };

                compareGraph(pivot, expected, done);
            });

        });

        describe('blacklisting', () => {

            it('accepts empty', (done) => {

                const pivot = { 
                    events: [{'EventID': 'xx', 'y': 'z'}],
                    connectionsBlacklist: undefined
                };
                const expected = {
                    graph: [
                        {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y'}
                    ]
                };

                compareGraph(pivot, expected, done);

            });

            it('accepts lists', (done) => {

                const pivot = { 
                    events: [{'EventID': 'xx', 'y': 'z'}], 
                    connectionsBlacklist: ['y', 'fake']
                };
                const expected = {
                    graph: [ ], 
                    labels: [ {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'} ]
                };

                compareGraph(pivot, expected, done);

            });   


        });
    });

});
        
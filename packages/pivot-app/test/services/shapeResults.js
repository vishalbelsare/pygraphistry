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
                {edge: 'xx:y', 'col': 'y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
            ], 
            labels: [
                {'node': 'xx', 'EventID': 'xx', 'type': 'EventID', 'y': 'z'}, 
                {'node': 'z', 'type': 'y', 'cols': ['y']}
            ]
        };

        compareGraph(pivot, expected, done);
    });

    it('hypergraph does not create nulls', function (done) {

        const pivot = { events: [{'EventID': 'xx', 'y': 'z', 'a': undefined, 'b': null, 'c': '', 'd': '""'}] };
        const pivotWithoutUndefined = JSON.parse(JSON.stringify(pivot));
        const expected = {
            graph: [
                {
                    ...(pivotWithoutUndefined.events[0]),
                    edge: 'xx:y', 'col': 'y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'edgeType': 'EventID->y', 'edgeTitle': 'xx->z'
                }
            ], 
            labels: [
                {...(pivotWithoutUndefined.events[0]),'node': 'xx', 'EventID': 'xx', 'type': 'EventID'}, 
                {'node': 'z', 'type': 'y', 'cols': ['y']}
            ]
        };

        compareGraph(pivot, expected, done);
    });


    it('hypergraph handles multiple non-overlapping events', function (done) {

        const pivot = {events: [
            {'EventID': 'xx', 'y': 'z'},
            {'EventID': 'yy', 'y': 'r', 'a': 1}
            ]};
        const expected = {
            graph: [
                {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y',
                 'edge': 'xx:y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'},
                {'EventID': 'yy', 'source': 'yy', 'destination': 'r', 'col': 'y',
                 'edge': 'yy:y', 'edgeType': 'EventID->y', 'y':'r', 'a': 1, 'edgeTitle': 'yy->r'},                 
                {'EventID': 'yy', 'source': 'yy', 'destination': 1, 'col': 'a',
                 'edge': 'yy:a', 'edgeType': 'EventID->a', 'y':'r', 'a': 1, 'edgeTitle': 'yy->1'}
            ],
            labels: [
                {'node': 'xx', 'EventID': 'xx', 'type': 'EventID', 'y': 'z'},
                {'node': 'z', 'type': 'y', 'cols': ['y']},
                {'node': 'yy', 'EventID': 'yy', 'type': 'EventID', 'y': 'r', 'a': 1},
                {'node': 'r', 'type': 'y', 'cols': ['y']},
                {'node': 1, 'type': 'a', 'cols': ['a']}
            ]
        }

        compareGraph(pivot, expected, done);

    });

    it('hypergraph handles multiple overlapping events', function (done) {

        const pivot = {events: [
            {'EventID': 'xx', 'y': 'z'},
            {'EventID': 'yy', 'y': 'z', 'a': 1}
            ]};
        const expected = {
            graph: [
                {'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y',
                 'edge': 'xx:y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'},
                {'EventID': 'yy', 'source': 'yy', 'destination': 'z', 'col': 'y',
                 'edge': 'yy:y', 'edgeType': 'EventID->y', 'y':'z', 'a': 1, 'edgeTitle': 'yy->z'},                 
                {'EventID': 'yy', 'source': 'yy', 'destination': 1, 'col': 'a',
                 'edge': 'yy:a', 'edgeType': 'EventID->a', 'y':'z', 'a': 1, 'edgeTitle': 'yy->1'}
            ],
            labels: [
                {'node': 'xx', 'EventID': 'xx', 'type': 'EventID', 'y': 'z'},
                {'node': 'z', 'type': 'y', 'cols': ['y']},
                {'node': 'yy', 'EventID': 'yy', 'type': 'EventID', 'y': 'z', 'a': 1},
                {'node': 1, 'type': 'a', 'cols': ['a']}
            ]
        }

        compareGraph(pivot, expected, done);

    });


    it('hypergraph skips nulls', function (done) {

        const pivot = { events: [{'EventID': 'xx', 'y': 'z', 'a': null, 'b': undefined}] };
        const expected = {
            graph: [
                {'source': 'xx', 'destination': 'z', 'col': 'y',
                 'a': null,
                 'edge': 'xx:y', 'EventID': 'xx', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
            ], 
            labels: [
                {'node': 'xx', 'EventID': 'xx', 'type': 'EventID', 'y': 'z', 'a': null}, 
                {'node': 'z', 'type': 'y', 'cols': ['y']}
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

        const pivot = { graph: { nodes: [], edges: [ {source: 'x', destination: 'y', 'edge': 'myedge'} ]}};
        const expected = { labels: [], graph: pivot.graph.edges };

        compareGraph(pivot, expected, done);
    });


    it('graph synthesizes edge ids', (done) => {

        const pivot = {id: 'myPivot', graph: { nodes: [], edges: [ {source: 'x', destination: 'y'}, {source: 'x', destination: 'z'} ]}};
        const expected = { labels: [], graph: [ 
            {source: 'x', destination: 'y', edge: 'edge_myPivot_0'}, 
            {source: 'x', destination: 'z', edge: 'edge_myPivot_1'} ] };

        compareGraph(pivot, expected, done);
    });


    it('graph nodes+edges', (done) => {

        const pivot = { graph: { nodes: [ { node: 'x', a: 'b'} ], edges: [ { source: 'x', destination: 'y', 'edge': 'myedge'} ]}};
        const expected = { labels: pivot.graph.nodes, graph: pivot.graph.edges };

        compareGraph(pivot, expected, done);
    });

    it('hypergraph + graph', (done) => {

        const pivot = {
            graph: {
                nodes: [ {node: 'x', a: 'b'} ], 
                edges: [ {source: 'x', destination: 'y', 'edge': 'myedge'} ]},
            events: [ {'EventID': 'xx', 'y': 'z'} ]
        };
        const expected = { 
            graph: [
                {edge: 'xx:y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'},
                {edge: 'myedge', source: 'x', destination: 'y'}
            ], 
            labels: [
                {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                {'node': 'z', 'type': 'y', 'cols': ['y']},
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
                        {'edge': 'xx:y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y', 'cols': ['y']}
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
                        {'edge': 'xx:y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y', 'cols': ['y']}
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
                        {'edge': 'xx:y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y', 'cols': ['y']}
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
                        {'edge': 'xx:y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y', 'edgeType': 'EventID->y', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID'}, 
                        {'node': 'z', 'type': 'y', 'cols': ['y']}
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
                        {'edge': 'xx:y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y', 'cols': ['y']}
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
                        {'edge': 'xx:y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z', 'a': 'b', 'c': 'd'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z', 'a': 'b', 'c': 'd'}, 
                        {'node': 'z', 'type': 'y', 'cols': ['y']}
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
                        {'edge': 'xx:y', 'EventID': 'xx', 'source': 'xx', 'destination': 'z', 'col': 'y', 'edgeType': 'EventID->y', 'y':'z', 'edgeTitle': 'xx->z'}
                    ], 
                    labels: [
                        {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'y': 'z'}, 
                        {'node': 'z', 'type': 'y', 'cols': ['y']}
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


    const template = {
        encodings: {
            edge: {
                edgeRefType: function (edge) {
                    if (edge.edgeType && edge.edgeType.indexOf('EventID->') === 0) {
                        const mapping = {
                            'refA_colA': 'A',
                            'refA_colB': 'A',
                            'refA_colC': 'A',
                            'refX_colX': 'X',
                            'refX_colY': 'X',
                            'refX_colZ': 'X'
                        };
                        const col = edge.edgeType.slice('EventID->'.length);
                        if (col in mapping) {
                            edge.refType = mapping[col];    
                        }                    
                    }
                }
            }
        }
    };

    describe('refTypes', () => {

        it('it ignores non refTypes', (done) => {
            
            const pivot = { 
                events: [{'EventID': 'xx', 'noref': 'z'}],
                template
            };
            const expected = {
                graph: [ {'edge': 'xx:noref', 'EventID': 'xx', 'source': 'xx', 'destination': 'z',  'col': 'noref',
                    'edgeType': 'EventID->noref', 'noref':'z', 'edgeTitle': 'xx->z'}], 
                labels: [ 
                    {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'noref': 'z'},
                    {'node': 'z', 'type': 'noref', 'cols': ['noref']}]
            };

            compareGraph(pivot, expected, done);
        });


        it('it tags refTypes', (done) => {
            
            const pivot = { 
                events: [{'EventID': 'xx', 'refA_colA': 'z'}],
                template
            };
            const expected = {
                graph: [ 
                    {'edge': 'xx:A:z', 'EventID': 'xx', 'source': 'xx', 'destination': 'z',  'cols': ['refA_colA'],
                    'edgeType': 'EventID->refA_colA', 'refA_colA':'z', 'edgeTitle': 'xx->z',
                    'refType': 'A'}], 
                labels: [ 
                    {'EventID': 'xx', 'node': 'xx', 'type': 'EventID', 'refA_colA': 'z'},
                    {'node': 'z', 'type': 'refA_colA', 
                     'refTypes': ['A'], 'cols': ['refA_colA']} ]
            };

            compareGraph(pivot, expected, done);
        });

        it('it collects incident cols, refTypes, and links refTypes', (done) => {
            
            const pivot = { 
                events: [{'EventID': 'xx', 'refA_colA': 'x', 'refA_colB': 'x', 'refA_colC': 'y', 'refX_colX': 'x'}],
                template
            };
            const expected = {
                graph: [                    
                    {...pivot.events[0], 
                     'edge': 'xx:A:x', 'source': 'xx', 'destination': 'x',  'cols': ['refA_colA', 'refA_colB'],
                     'edgeType': 'EventID->refA_colA', 'edgeTitle': 'xx->x', 'refType': 'A'},
                    {...pivot.events[0], 
                     'edge': 'xx:A:y', 'source': 'xx', 'destination': 'y', 'cols': ['refA_colC'],
                     'edgeType': 'EventID->refA_colC', 'edgeTitle': 'xx->y', 'refType': 'A'},
                    {...pivot.events[0], 
                     'edge': 'xx:X:x', 'source': 'xx', 'destination': 'x', 'cols': ['refX_colX'],
                     'edgeType': 'EventID->refX_colX', 'edgeTitle': 'xx->x', 'refType': 'X'},
                    {'edge': 'ref:A:x:y', 'source': 'x', 'destination': 'y', 'edgeType': 'ref:A', 'refType': 'A',
                     'edgeTitle': 'A:x->y'}
                ], 
                labels: [ 
                    {...pivot.events[0], node: 'xx', 'type': 'EventID'},
                    {'node': 'x', 'type': 'refA_colA', 'refTypes': ['A', 'X'], 'cols': ['refA_colA', 'refA_colB', 'refX_colX']},
                    {'node': 'y', 'type': 'refA_colC', 'refTypes': ['A'], 'cols': ['refA_colC']}]
            };

            compareGraph(pivot, expected, done);
        });

          it('makes shared refType entities into a strongly connected component', (done) => {
            
            const pivot = { 
                events: [{'EventID': 'xx', 'refA_colA': 'a', 'refA_colB': 'b', 'refA_colC': 'c', 'noref': 'd'}],
                template
            };
            const expected = {
                graph: [ 
                    {...pivot.events[0], 
                     'edge': 'xx:A:a', 'source': 'xx', 'destination': 'a', 'cols': ['refA_colA'],
                     'edgeType': 'EventID->refA_colA', 'edgeTitle': 'xx->a', 'refType': 'A'},
                    {...pivot.events[0], 
                     'edge': 'xx:A:b', 'source': 'xx', 'destination': 'b',  'cols': ['refA_colB'],
                     'edgeType': 'EventID->refA_colB', 'edgeTitle': 'xx->b', 'refType': 'A'},
                    {...pivot.events[0], 
                     'edge': 'xx:A:c', 'source': 'xx', 'destination': 'c',  'cols': ['refA_colC'],
                     'edgeType': 'EventID->refA_colC', 'edgeTitle': 'xx->c', 'refType': 'A'},
                    {...pivot.events[0], 
                     'edge': 'xx:noref', 'source': 'xx', 'destination': 'd', 'col': 'noref',
                     'edgeType': 'EventID->noref', 'edgeTitle': 'xx->d'},

                    {'edge': 'ref:A:a:b', 'source': 'a', 'destination': 'b', 'edgeType': 'ref:A', 
                     'refType': 'A', 'edgeTitle': 'A:a->b'},
                    {'edge': 'ref:A:a:c', 'source': 'a', 'destination': 'c', 'edgeType': 'ref:A', 
                     'refType': 'A', 'edgeTitle': 'A:a->c'},
                    {'edge': 'ref:A:b:c', 'source': 'b', 'destination': 'c', 'edgeType': 'ref:A', 
                     'refType': 'A', 'edgeTitle': 'A:b->c'}
                ], 
                labels: [ 
                    {...pivot.events[0], node: 'xx', 'type': 'EventID'},
                    {'node': 'a', 'type': 'refA_colA', 'refTypes': ['A'], 'cols': ['refA_colA']},
                    {'node': 'b', 'type': 'refA_colB', 'refTypes': ['A'], 'cols': ['refA_colB']},
                    {'node': 'c', 'type': 'refA_colC', 'refTypes': ['A'], 'cols': ['refA_colC']},
                    {'node': 'd', 'type': 'noref', 'cols': ['noref']}
                ]
            };

            compareGraph(pivot, expected, done);
        });


    });

});
        
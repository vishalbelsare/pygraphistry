import { assert } from 'chai';
import mkdirp from 'mkdirp';

import { graphUnion } from '../../../src/shared/services/shape/graph';

function compareGraphs(g1, g2, expected) {
    assert.deepEqual(graphUnion(g1, g2, 'node', 'edge'), expected);
}

describe('graphUnion', function() {
    it('does not merge distinct nodes, edges', done => {
        const g1 = {
            nodes: [{ node: 'x', fld1: 'a' }],
            edges: [{ edge: 'e1', fld1: 'x' }]
        };
        const g2 = {
            nodes: [{ node: 'y', fld2: 'b' }],
            edges: [{ edge: 'e2' }]
        };

        const expected = { nodes: g1.nodes.concat(g2.nodes), edges: g1.edges.concat(g2.edges) };

        compareGraphs(g1, g2, expected);
        done();
    });

    it('does merge same nodes, edges', done => {
        const g1 = {
            nodes: [{ node: 'x', fld1: 'a' }],
            edges: [{ edge: 'e1', fld1: 'x' }]
        };
        const g2 = {
            nodes: [{ node: 'x', fld2: 'b' }],
            edges: [{ edge: 'e1', fld2: 'y' }]
        };

        const expected = {
            nodes: [{ ...g1.nodes[0], ...g2.nodes[0] }],
            edges: [{ ...g1.edges[0], ...g2.edges[0] }]
        };

        compareGraphs(g1, g2, expected);
        done();
    });

    it('unions refTypes, cols', done => {
        const g1 = {
            nodes: [{ node: 'x', cols: ['a', 'x'], refTypes: ['a', 'x'] }],
            edges: [{ edge: 'e1', cols: ['a', 'x'] }]
        };
        const g2 = {
            nodes: [{ node: 'x', cols: ['x', 'b'], refTypes: ['x', 'b'] }],
            edges: [{ edge: 'e1', cols: ['x', 'b'] }]
        };

        const expected = {
            nodes: [
                { ...g1.nodes[0], ...g2.nodes[0], cols: ['a', 'x', 'b'], refTypes: ['a', 'x', 'b'] }
            ],
            edges: [{ ...g1.edges[0], ...g2.edges[0], cols: ['a', 'x', 'b'] }]
        };

        compareGraphs(g1, g2, expected);
        done();
    });
});

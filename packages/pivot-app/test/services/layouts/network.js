import { assert } from 'chai';
import * as network from '../../../src/shared/services/layouts/network';

describe('mergeLabels', () => {
    it('should merge labels like it says', () => {
        assert.deepEqual(network.INOUT, network.mergeLabels(network.IN, network.OUT));
    });
    it('should decorate insideness', () => {
        const i = { node: '10.11.12.13', refType: 'src' };
        const i2 = { node: 'jerry', refType: 'src' };
        const o = { node: '52.52.67.237', refType: 'dst' };
        const o2 = { node: 'evil.ru', refType: 'dst' };
        const x = { node: 'other', refType: 'whoknowswhat' };
        const e = { node: '0:857', type: 'EventID' };
        const s = 'source';
        const d = 'destination';
        const r = 'refType';
        const n = 'node';

        const nodes = [i, o, x, e, i2, o2];
        const edges = [
            { [s]: e[n], [d]: i[n], [r]: i[r] },
            { [s]: e[n], [d]: o[n], [r]: o[r] },
            { [s]: e[n], [d]: x[n], [r]: x[r] },
            { [s]: e[n], [d]: i2[n], [r]: i2[r] },
            { [s]: e[n], [d]: o2[n], [r]: o2[r] }
        ];
        const graph = { data: { graph: edges, labels: nodes } };

        network.decorateInsideness(graph);
        assert.deepEqual(i.canonicalInsideness, 'inside');
        assert.deepEqual(i2.canonicalInsideness, 'inside');
        assert.deepEqual(o.canonicalInsideness, 'outside');
        assert.deepEqual(o2.canonicalInsideness, 'outside');
        assert.deepEqual(x.canonicalInsideness, 'mixed');
        assert.deepEqual(e.canonicalInsideness, 'mixed');
    });
});

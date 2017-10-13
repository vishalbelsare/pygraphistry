import { assert } from 'chai';
import mkdirp from 'mkdirp';

import { flattenJson } from '../../../src/shared/services/support/flattenJson';

function testFlattenJson(name, nested, flattened) {
    it(name, done => {
        assert.deepEqual(flattenJson(nested), flattened);
        done();
    });
}

describe('testFlattenJson', function() {
    testFlattenJson('empty 1', undefined, {});
    testFlattenJson('empty 2', null, {});
    testFlattenJson('empty 3', {}, {});

    testFlattenJson('shallow', { aa: 1, bb: '2', cc: null }, { aa: 1, bb: '2', cc: null });
    testFlattenJson(
        'nested',
        { l1: { l2: { l3a: 1, l3b: 'zz' }, l2b: 'zz' }, l1b: 123 },
        {
            'l1.l2.l3a': 1,
            'l1.l2.l3b': 'zz',
            'l1.l2b': 'zz',
            l1b: 123
        }
    );
    testFlattenJson('array simple', [0, 'a'], { 0: 0, 1: 'a' });
    testFlattenJson('array nested', [0, 'a', { x: 1, y: { z: 2 } }], {
        0: 0,
        1: 'a',
        '2.x': 1,
        '2.y.z': 2
    });
});

import { assert } from 'chai';
import mkdirp from 'mkdirp';
import { DataFrame } from 'dataframe-js';

import { dfUnion } from '../../../src/shared/services/shape/df';

describe('dfUnion', function() {
  it('mismatched columns', done => {
    const a = { a: 'b', c: 'd' };
    const b = { a: 'b', e: 'f' };

    const a2 = { a: 'b', c: 'd', e: undefined };
    const b2 = { a: 'b', e: 'f', c: undefined };

    const out = dfUnion(new DataFrame([a]), new DataFrame([b])).toCollection();

    assert.deepEqual(out, [a2, b2]);
    done();
  });
});

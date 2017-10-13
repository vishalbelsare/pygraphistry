import { assert } from 'chai';
import mkdirp from 'mkdirp';
import { DataFrame } from 'dataframe-js';

import { mergeByKey } from '../../../src/shared/services/support/mergeByKey';

const a = { a: 'b', c: 'd' };
const a2 = { a: 'b2', g: 'h' };
const b = { a: 'b', e: 'f' };
const c = { g: 'h' };

describe('mergeByKey', function() {
  it('empty', done => {
    const out = mergeByKey([], 'zz');
    const expected = [];

    assert.deepEqual(out, expected);
    done();
  });

  it('drop empty', done => {
    const out = mergeByKey([a, c], 'a');
    const expected = [a];

    assert.deepEqual(out, expected);
    done();
  });

  it('unique', done => {
    const out = mergeByKey([a, a2], 'a');
    const expected = [a, a2];

    assert.deepEqual(out, expected);
    done();
  });

  it('merge', done => {
    const out = mergeByKey([a, b], 'a');
    const expected = [{ ...a, ...b }];

    assert.deepEqual(out, expected);
    done();
  });

  it('mixed', done => {
    const out = mergeByKey([a, a2, b, c], 'a');
    const expected = [{ ...a, ...b }, a2];

    assert.deepEqual(out, expected);
    done();
  });
});

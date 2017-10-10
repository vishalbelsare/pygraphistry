import { assert } from 'chai';

import {
  expand,
  intersectionMatch
} from '../../../../src/shared/services/templates/splunk/expand.js';

describe('Splunk:expand', () => {
  describe('helpers', () => {
    describe('intersectionMatch', () => {
      it('handles nulls', () => {
        assert.deepEqual(intersectionMatch(), false);
        assert.deepEqual(intersectionMatch(null, null), false);
        assert.deepEqual(intersectionMatch(undefined, undefined), false);
        assert.deepEqual(intersectionMatch(undefined, undefined), false);
      });

      it('handles empty', () => {
        assert.deepEqual(intersectionMatch([]), false);
        assert.deepEqual(intersectionMatch(undefined, []), false);
        assert.deepEqual(intersectionMatch([], []), false);
      });

      it('matches', () => {
        assert.deepEqual(intersectionMatch(['a'], ['a']), true);
        assert.deepEqual(intersectionMatch(['b', 'a'], ['a']), true);
        assert.deepEqual(intersectionMatch(['a', 'b'], ['a']), true);
        assert.deepEqual(intersectionMatch(['a'], ['b', 'a']), true);
        assert.deepEqual(intersectionMatch(['a'], ['a', 'b']), true);
      });

      it('rejects', () => {
        assert.deepEqual(intersectionMatch(['a', 'b'], ['c']), false);
        assert.deepEqual(intersectionMatch(['c'], ['a', 'b']), false);
      });
    });
  });

  it('handles empty', () => {
    assert.deepEqual(expand({}), '  | head 10000 ');
  });

  it('handles one pivot, node', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        filter,
        pivotIds: [pivot],
        fields: [field],
        pivotCache: { [pivot]: { results: { labels: [{ node: val, type: field }] } } }
      }),
      `${filter} "${field}"="${val}" | head 10000 `
    );
  });

  it('handles multiple col matches', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        filter,
        colMatch: true,
        pivotIds: [pivot],
        fields: [field],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ node: val, type: field }, { node: '1' + val, type: field }]
            }
          }
        }
      }),
      `${filter} "${field}"="${val}" OR "${field}"="1${val}" | head 10000 `
    );
  });

  it('handles multiple non-col matches', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        filter,
        colMatch: false,
        pivotIds: [pivot],
        fields: [field],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ node: val, type: field }, { node: '1' + val, type: field }]
            }
          }
        }
      }),
      `${filter} "${val}" OR "1${val}" | head 10000 `
    );
  });
  it('skips non-fields, matchAttributes=false', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        matchAttributes: false,
        pivotFields: [field],
        filter,
        pivotIds: [pivot],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [
                { node: val, type: field, ['fake_' + field]: 1 },
                { node: '1' + val, type: '1' + field, ['fake_' + field]: 1 }
              ]
            }
          }
        }
      }),
      `${filter} "${field}"="${val}" | head 10000 `
    );
  });

  it('handles one pivot with multiple events', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expand({
        filter,
        pivotIds: [pivot],
        fields: [field],
        pivotCache: {
          [pivot]: {
            results: { labels: [{ node: val1, type: field }, { node: val2, type: field }] }
          }
        }
      }),
      `${filter} "${field}"="${val1}" OR "${field}"="${val2}" | head 10000 `
    );
  });

  it('handles all pivots', () => {
    const filter = 'mySource';
    const pivot1 = 'asdf';
    const pivot2 = 'fdsa';
    const field = 'myField';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expand({
        filter,
        pivotIds: [pivot1, pivot2],
        fields: [field],
        pivotCache: {
          [pivot1]: { results: { labels: [{ type: field, node: val1 }] } },
          [pivot2]: { results: { labels: [{ type: field, node: val2 }] } }
        }
      }),
      `${filter} "${field}"="${val1}" OR "${field}"="${val2}" | head 10000 `
    );
  });

  it('handles multiple fields', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field1 = 'myField';
    const field2 = 'myField2';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expand({
        filter,
        pivotIds: [pivot],
        fields: [field1, field2],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ type: field1, node: val1 }, { type: field2, node: val2 }]
            }
          }
        }
      }),
      `${filter} "${field1}"="${val1}" OR "${field2}"="${val2}" | head 10000 `
    );
  });

  it('handles *', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const val = 'myVal';
    const field = 'myField';

    assert.deepEqual(
      expand({
        filter,
        fields: ['*'],
        pivotIds: [pivot],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [
                {
                  type: field,
                  node: val
                }
              ]
            }
          }
        }
      }),
      `${filter} "${field}"="${val}" | head 10000 `
    );
  });

  it('handles fields=[] as *', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const val = 'myVal';
    const field = 'myField';

    assert.deepEqual(
      expand({
        filter,
        fields: [],
        pivotIds: [pivot],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [
                {
                  type: field,
                  node: val
                }
              ]
            }
          }
        }
      }),
      `${filter} "${field}"="${val}" | head 10000 `
    );
  });

  it('* skips reserved fields', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const val = 'myVal';
    const field = 'myField';

    assert.deepEqual(
      expand({
        filter,
        pivotIds: [pivot],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [
                {
                  node: val,
                  type: field,
                  ok: 1,
                  pointColor: 1,
                  pointSize: 10,
                  pointIcon: 'alarm',
                  pointTitle: 'x'
                }
              ]
            }
          }
        }
      }),
      `${filter} "${field}"="${val}" OR "ok"="1" | head 10000 `
    );
  });

  it('* can opt into reserved fields', () => {
    const filter = 'mySource';
    const pivot = 'asdf';

    assert.deepEqual(
      expand({
        filter,
        pivotFields: ['*', 'node'],
        pivotIds: [pivot],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [
                {
                  node: 'x',
                  type: 'y',
                  pointColor: 1,
                  pointSize: 10,
                  pointIcon: 'alarm',
                  pointTitle: 'x'
                }
              ]
            }
          }
        }
      }),
      `${filter} "y"="x" OR "node"="x" | head 10000 `
    );
  });

  it('can do colMatch=false,', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        colMatch: false,
        filter,
        pivotIds: [pivot],
        fields: [field],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ type: field, node: val }, { type: field, node: val }]
            }
          }
        }
      }),
      `${filter} "${val}" | head 10000 `
    );
  });

  it('can do col expand (miss),', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        colMatch: false,
        filter,
        pivotIds: [pivot],
        pivotFields: [field],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ type: field + 'X', node: val, cols: [] }, { type: field + 'X', node: val }]
            }
          }
        }
      }),
      `${filter}  | head 10000 `
    );
  });

  it('can do col expand (hit),', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        colMatch: false,
        filter,
        pivotIds: [pivot],
        pivotFields: [field],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [
                { type: field + 'X', node: val, cols: [field] },
                { type: field + 'X', node: val }
              ]
            }
          }
        }
      }),
      `${filter} "${val}" | head 10000 `
    );
  });

  it('can do refTypes expand (miss),', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        colMatch: false,
        filter,
        pivotIds: [pivot],
        pivotFields: [field],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [
                { type: field + 'X', node: val, refTypes: [] },
                { type: field + 'X', node: val }
              ]
            }
          }
        }
      }),
      `${filter}  | head 10000 `
    );
  });

  it('can do refTypes expand (hit),', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field = 'myField';
    const val = 'myVal';

    assert.deepEqual(
      expand({
        colMatch: false,
        filter,
        pivotIds: [pivot],
        pivotFields: [field],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [
                { type: field + 'X', node: val, refTypes: [field] },
                { type: field + 'X', node: val }
              ]
            }
          }
        }
      }),
      `${filter} "${val}" | head 10000 `
    );
  });

  it('handles matchAttributes=true 1', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field1 = 'myField';
    const field2 = 'myField2';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expand({
        filter,
        matchAttributes: true,
        pivotIds: [pivot],
        pivotFields: [field1],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ [field1]: val1 }, { [field2]: val2 }]
            }
          }
        }
      }),
      `${filter} "${field1}"="${val1}" | head 10000 `
    );
  });

  it('handles matchAttributes=true all', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field1 = 'myField';
    const field2 = 'myField2';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expand({
        filter,
        matchAttributes: true,
        pivotIds: [pivot],
        pivotFields: [field1, field2],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ [field1]: val1 }, { [field2]: val2 }]
            }
          }
        }
      }),
      `${filter} "${field1}"="${val1}" OR "${field2}"="${val2}" | head 10000 `
    );
  });

  it('dedupes cols', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field1 = 'myField';
    const field2 = 'myField2';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expand({
        filter,
        matchAttributes: true,
        pivotIds: [pivot],
        fields: [field1, field2],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ [field1]: val1 }, { [field1]: val1, [field2]: val2 }]
            }
          }
        }
      }),
      `${filter} "${field1}"="${val1}" OR "${field2}"="${val2}" | head 10000 `
    );
  });

  it('dedupes non-cols', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field1 = 'myField';
    const field2 = 'myField2';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expand({
        filter,
        colMatch: false,
        matchAttributes: true,
        pivotIds: [pivot],
        fields: [field1, field2],
        pivotCache: {
          [pivot]: {
            results: {
              labels: [{ [field1]: val1 }, { [field1]: val1, [field2]: val2 }]
            }
          }
        }
      }),
      `${filter} "${val1}" OR "${val2}" | head 10000 `
    );
  });

  it('handles matchAttributes=false', () => {
    const filter = 'mySource';
    const pivot = 'asdf';
    const field1 = 'myField';
    const field2 = 'myField2';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expand({
        filter,
        matchAttributes: false,
        pivotIds: [pivot],
        fields: [field1, field2],
        pivotCache: { [pivot]: { results: { labels: [{ [field1]: val1 }, { [field2]: val2 }] } } }
      }),
      `${filter}  | head 10000 `
    );
  });
});

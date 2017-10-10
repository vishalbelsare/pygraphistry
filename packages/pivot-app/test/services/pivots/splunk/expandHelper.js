import { assert } from 'chai';

import { expandArrow } from '../../../../src/shared/services/templates/splunk/expandHelper';

describe('Splunk:expandHelper', () => {
  it('handles non-arrows', () => {
    assert.deepEqual(expandArrow('zzz'), undefined);
  });

  it('handles one pivot', () => {
    const pivot = 'asdf';
    const field = 'myField';
    const source = 'mySource';
    const val = 'myVal';

    assert.deepEqual(
      expandArrow(`[{{${pivot}}}] -[${field}]-> [${source}]`, {
        [pivot]: { events: [{ [field]: val }] }
      }),
      `${source} "${field}"="${val}" | head 10000 `
    );
  });

  it('handles one pivot with multiple events', () => {
    const pivot = 'asdf';
    const field = 'myField';
    const source = 'mySource';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expandArrow(`[{{${pivot}}}] -[${field}]-> [${source}]`, {
        [pivot]: { events: [{ [field]: val1 }, { [field]: val2 }] }
      }),
      `${source} "${field}"="${val1}" OR "${field}"="${val2}" | head 10000 `
    );
  });

  it('handles all pivots', () => {
    const pivot1 = 'asdf';
    const pivot2 = 'fdsa';
    const field = 'myField';
    const source = 'mySource';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expandArrow(`[{{${pivot1},${pivot2}}}] -[${field}]-> [${source}]`, {
        [pivot1]: { events: [{ [field]: val1 }] },
        [pivot2]: { events: [{ [field]: val2 }] }
      }),
      `${source} "${field}"="${val1}" OR "${field}"="${val2}" | head 10000 `
    );
  });

  it('handles multiple fields', () => {
    const pivot = 'asdf';
    const field1 = 'myField';
    const field2 = 'myField2';
    const source = 'mySource';
    const val1 = 'myVal';
    const val2 = 'myVal2';

    assert.deepEqual(
      expandArrow(`[{{${pivot}}}] -[${field1},${field2}]-> [${source}]`, {
        [pivot]: { events: [{ [field1]: val1, [field2]: val2 }] }
      }),
      `${source} "${field1}"="${val1}" OR "${field2}"="${val2}" | head 10000 `
    );
  });
});

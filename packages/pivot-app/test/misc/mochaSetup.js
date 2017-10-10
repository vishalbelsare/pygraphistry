const assert = require('assert');

describe('Mocha setup', function() {
  it('ES7 compilation through Babel', function() {
    const x = { a: 1, b: 2 };
    assert.deepEqual({ ...x, b: 4, c: 3 }, { a: 1, b: 4, c: 3 });
  });
});

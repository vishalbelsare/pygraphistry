import express from 'express';
import { assert } from 'chai';

import { HTTP_EXPAND } from '../../../src/shared/services/templates/http/httpExpand';

describe('HttpExpand', function() {
  it('constant', function(done) {
    assert.deepEqual(
      HTTP_EXPAND.toUrls({ endpoint: 'http://www.google.com', pRef: { value: 0 } }, [
        { events: [{ x: 1 }, { x: 3 }] },
        { events: [] },
        { events: [] }
      ]),
      [
        {
          url: 'http://www.google.com',
          params: { x: 1, endpoint: 'http://www.google.com', pRef: 0 }
        },
        {
          url: 'http://www.google.com',
          params: { x: 3, endpoint: 'http://www.google.com', pRef: 0 }
        }
      ]
    );
    done();
  });

  it('row params', function(done) {
    assert.deepEqual(
      HTTP_EXPAND.toUrls({ endpoint: 'http://www.google.com/?v={x}', pRef: { value: 0 } }, [
        { events: [{ x: 1 }, { x: 3 }] },
        { events: [] },
        { events: [] }
      ]),
      [
        {
          url: 'http://www.google.com/?v=1',
          params: { x: 1, endpoint: 'http://www.google.com/?v={x}', pRef: 0 }
        },
        {
          url: 'http://www.google.com/?v=3',
          params: { x: 3, endpoint: 'http://www.google.com/?v={x}', pRef: 0 }
        }
      ]
    );
    done();
  });

  it('row params 2nd', function(done) {
    assert.deepEqual(
      HTTP_EXPAND.toUrls({ endpoint: 'http://www.google.com/?v={y}', pRef: { value: 1 } }, [
        { events: [{ x: 1 }, { x: 3 }] },
        { events: [{ y: 'z' }] },
        { events: [] }
      ]),
      [
        {
          url: 'http://www.google.com/?v=z',
          params: { y: 'z', endpoint: 'http://www.google.com/?v={y}', pRef: 1 }
        }
      ]
    );
    done();
  });

  it('pivot params', function(done) {
    assert.deepEqual(
      HTTP_EXPAND.toUrls(
        { endpoint: 'http://www.google.com/?v={x}&f={y}', pRef: { value: 0 }, y: 'z' },
        [{ events: [{ x: 1 }, { x: 3 }] }, { events: [] }, { events: [] }]
      ),
      [
        {
          url: 'http://www.google.com/?v=1&f=z',
          params: { x: 1, endpoint: 'http://www.google.com/?v={x}&f={y}', pRef: 0, y: 'z' }
        },
        {
          url: 'http://www.google.com/?v=3&f=z',
          params: { x: 3, endpoint: 'http://www.google.com/?v={x}&f={y}', pRef: 0, y: 'z' }
        }
      ]
    );
    done();
  });

  it('exn on missing event param', function(done) {
    const out = HTTP_EXPAND.toUrls(
      { endpoint: 'http://www.google.com/?v={x}&f={y}', pRef: { value: 0 } },
      [{ events: [{ x: 1 }, { x: 3 }] }, { events: [] }, { events: [] }]
    );
    assert.deepEqual(true, out[0] instanceof Error);
    assert.deepEqual(true, out[1] instanceof Error);
    done();
  });
});

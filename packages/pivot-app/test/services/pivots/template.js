import express from 'express';
import { assert } from 'chai';
import mkdirp from 'mkdirp';
import { Observable } from 'rxjs';
import request from 'request';
const get = Observable.bindNodeCallback(request.get.bind(request));

import { PivotTemplate } from '../../../src/shared/services/templates/template';

function checkPtSimple(pt, id, name) {
  assert.deepEqual(pt.id, id);
  assert.deepEqual(pt.name, name);
  assert.deepEqual(pt.pivotParametersUI, {});
  assert.deepEqual(pt.pivotParameterKeys, []);
}
function checkPtParams(pt, id, name, param2) {
  assert.deepEqual(pt.id, id);
  assert.deepEqual(pt.name, name);
  assert.deepEqual(pt.pivotParametersUI, {
    [id + '$$$fld1']: { id: id + '$$$fld1', name: 'fld1', inputType: 'textarea' },
    [id + '$$$fld2']: param2
  });
  assert.deepEqual(pt.pivotParameterKeys, [id + '$$$fld1', id + '$$$fld2']);
}

const ptSimple = new PivotTemplate({ id: 'x', name: 'y' });
const ptParams = new PivotTemplate({
  id: 'x',
  name: 'y',
  parameters: [{ name: 'fld1', inputType: 'textarea' }, { name: 'fld2', inputType: 'textarea' }]
});

describe('Pivot template', function() {
  it('simple', done => {
    const pt = ptSimple;
    checkPtSimple(pt, 'x', 'y');
    done();
  });

  it('params', done => {
    const pt = ptParams;
    checkPtParams(pt, 'x', 'y', { id: 'x$$$fld2', name: 'fld2', inputType: 'textarea' });
    done();
  });

  it('derive simple', done => {
    const pt = ptSimple;
    const pt2 = pt.clone({
      id: 'x2',
      name: 'y2'
    });
    checkPtSimple(pt, 'x', 'y');
    checkPtSimple(pt2, 'x2', 'y2');
    done();
  });

  it('derive params', done => {
    const pt = ptParams;
    const pt2 = pt.clone({
      id: 'x2',
      name: 'y2',
      parameters: [{ name: 'fld2', placeholder: 'zz' }]
    });
    checkPtParams(pt, 'x', 'y', { id: 'x$$$fld2', name: 'fld2', inputType: 'textarea' });
    checkPtParams(pt2, 'x2', 'y2', {
      id: 'x2$$$fld2',
      name: 'fld2',
      inputType: 'textarea',
      placeholder: 'zz'
    });
    done();
  });

  it('catch incomplete derivation', done => {
    try {
      const pt = ptSimple;
      pt.clone({});
    } catch (e) {
      return done();
    }
    return done(new Error('Expected exception'));
  });

  it('catch overriding non-existent param', done => {
    try {
      const pt = ptParams;
      pt.clone({ id: 'x2', name: 'y2', params: [{ name: 'fld3', placeholder: 'zz' }] });
    } catch (e) {
      return done();
    }
    return done(new Error('Expected exception'));
  });
  it('catch overriding non-whitelisted param setting', done => {
    try {
      const pt = ptParams;
      pt.clone({ id: 'x2', name: 'y2', params: [{ name: 'fld2', id: 'zz' }] });
    } catch (e) {
      return done();
    }
    return done(new Error('Expected exception'));
  });
});

describe('Pivot template cloning', function() {
  it('Exn for missing constructor params (undef)', done => {
    try {
      const pt = ptSimple;
      const clone = pt.clone();
      done('Expected exn');
    } catch (e) {
      done();
    }
  });

  it('Exn for missing constructor params (basic empty)', done => {
    try {
      const pt = ptSimple;
      const clone = pt.clone({});
      done('Expected exn');
    } catch (e) {
      done();
    }
  });

  it('basic simple renaming', done => {
    const pt = ptSimple;
    const clone = pt.clone({ id: 'foo', name: 'bar', tags: ['x'] });
    checkPtSimple(pt, 'x', 'y');
    checkPtSimple(clone, 'foo', 'bar');
    assert.deepEqual(clone.tags, ['x']);
    done();
  });

  it('exn on illegal field override', done => {
    try {
      const pt = ptSimple;
      const clone = pt.clone({ fake: 'field' });
      done('Expected exn');
    } catch (e) {
      done();
    }
  });

  it('param inheritance', done => {
    const pt = ptParams;
    const clone = pt.clone({ id: 'foo', name: 'bar' });
    checkPtParams(pt, 'x', 'y', { id: 'x$$$fld2', name: 'fld2', inputType: 'textarea' });
    checkPtParams(clone, 'foo', 'bar', { id: 'foo$$$fld2', name: 'fld2', inputType: 'textarea' });
    done();
  });

  it('param override', done => {
    const pt = ptParams;
    const clone = pt.clone({
      id: 'foo',
      name: 'bar',
      parameters: [
        {
          name: 'fld2',
          defaultValue: 'zzz',
          label: 'fff',
          isVisible: true
        }
      ]
    });
    checkPtParams(pt, 'x', 'y', { id: 'x$$$fld2', name: 'fld2', inputType: 'textarea' });
    checkPtParams(clone, 'foo', 'bar', {
      id: 'foo$$$fld2',
      name: 'fld2',
      inputType: 'textarea',
      defaultValue: 'zzz',
      label: 'fff',
      isVisible: true
    });
    done();
  });

  if (
    ('param addition',
    done => {
      const pt = ptParams;
      const clone = pt.clone({
        id: 'foo',
        name: 'bar',
        parameters: [
          {
            name: 'fld3',
            inputType: 'textarea',
            defaultValue: 'zzz',
            label: 'fff',
            isVisible: true
          }
        ]
      });

      checkPtParams(pt, 'x', 'y', { id: 'x$$$fld2', name: 'fld2', inputType: 'textarea' });

      assert.deepEqual(clone.id, 'foo');
      assert.deepEqual(clone.name, 'bar');
      assert.deepEqual(clone.pivotParametersUI, {
        ['foo$$$fld1']: { id: 'foo$$$fld1', name: 'fld1', inputType: 'textarea' },
        ['foo$$$fld2']: { id: 'foo$$$fld2', name: 'fld2', inputType: 'textarea' },
        ['foo$$$fld3']: {
          id: 'foo$$$fld3',
          name: 'fld3',
          inputType: 'textarea',
          defaultValue: 'zzz',
          label: 'fff',
          isVisible: true
        }
      });
      assert.deepEqual(pt.pivotParameterKeys, ['foo$$$fld1', 'foo$$$fld2', 'foo$$$fld3']);

      done();
    })
  );

  it('exn for illegal param override', done => {
    try {
      const pt = ptParams;
      const clone = pt.clone({
        id: 'foo',
        name: 'bar',
        parameters: [
          {
            name: 'fld2',
            fake: 'blah'
          }
        ]
      });
      done('Expected exn');
    } catch (e) {
      done();
    }
  });

  it('exn for illegal param addition: unknown inputType', done => {
    try {
      const pt = ptParams;
      const clone = pt.clone({
        id: 'foo',
        name: 'bar',
        parameters: [{ name: 'fld3', inputType: 'fake' }]
      });
      done('Expected exn');
    } catch (e) {
      done();
    }
  });

  it('exn for illegal param addition: missing name', done => {
    try {
      const pt = ptParams;
      const clone = pt.clone({
        id: 'foo',
        name: 'bar',
        parameters: [{ inputType: 'textarea' }]
      });
      done('Expected exn');
    } catch (e) {
      done();
    }
  });
});

import express from 'express';
import { assert } from 'chai';
import mkdirp from 'mkdirp';
import { Observable } from 'rxjs';
import request from 'request';
const get = Observable.bindNodeCallback(request.get.bind(request));

import { PivotTemplate } from '../../../src/shared/services/templates/template';


function checkPtSimple (pt, id, name) {
    assert.deepEqual(pt.id, id);
    assert.deepEqual(pt.name, name);
    assert.deepEqual(pt.pivotParametersUI, {});
    assert.deepEqual(pt.pivotParameterKeys, []);
}
function checkPtParams (pt, id, name, param2) {
    assert.deepEqual(pt.id, id);
    assert.deepEqual(pt.name, name);
    assert.deepEqual(pt.pivotParametersUI, {
        [id + '$$$fld1']: { id: id + '$$$fld1', name: 'fld1', inputType: 'textarea' },
        [id + '$$$fld2']: param2
    });
    assert.deepEqual(pt.pivotParameterKeys, [id + '$$$fld1', id + '$$$fld2']);
}



describe('pivot.template', function () {

    it('simple', (done) => {
        const pt = new PivotTemplate({id: 'x', name: 'y'});
        checkPtSimple(pt, 'x', 'y');
        done();
    });

    it('params', (done) => {        
        const pt = new PivotTemplate({id: 'x', name: 'y', parameters: [
            { name: 'fld1', inputType: 'textarea' },
            { name: 'fld2', inputType: 'textarea' } ]});
        checkPtParams(pt, 'x', 'y', 
            { id: 'x$$$fld2', name: 'fld2', inputType: 'textarea'});
        done();
    });

    it('derive simple', (done) => {
        const pt = new PivotTemplate({id: 'x', name: 'y'});
        const pt2 = pt.derive({
            id: 'x2',
            name: 'y2'
        });
        checkPtSimple(pt, 'x', 'y');        
        checkPtSimple(pt2, 'x2', 'y2');
        done();
    });

    it('derive params', (done) => {        
        const pt = new PivotTemplate({id: 'x', name: 'y', parameters: [
            { name: 'fld1', inputType: 'textarea' },
            { name: 'fld2', inputType: 'textarea' } ]});
        const pt2 = pt.derive({
            id: 'x2',
            name: 'y2', parameters: [ {name: 'fld2', placeholder: 'zz'} ]
        });
        checkPtParams(pt, 'x', 'y',
            { id: 'x$$$fld2', name: 'fld2', inputType: 'textarea'});
        checkPtParams(pt2, 'x2', 'y2', 
            { id: 'x2$$$fld2', name: 'fld2', inputType: 'textarea', placeholder: 'zz' });
        done();
    });

});
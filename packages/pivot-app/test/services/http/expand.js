import express from 'express';
import { assert } from 'chai';

import { HTTP_EXPAND } from '../../../src/shared/services/templates/http/httpExpand';


describe('HttpExpand', function () {

    it('constant', function (done) {    
        assert.deepEqual(
            HTTP_EXPAND.toUrls(
                {endpoint: 'http://www.google.com', pRef: {value: 0}},
                [{events: [{x: 1}, {x: 3}]}, {events: []}, {events: []}]),
            ['http://www.google.com', 'http://www.google.com']);
        done();
    });
    
    it('row params', function (done) {  
        assert.deepEqual(
            HTTP_EXPAND.toUrls(
                {endpoint: 'http://www.google.com/?v={x}', pRef: {value: 0}},
                [{events: [{x: 1}, {x: 3}]}, {events: []}, {events: []}]),
            ['http://www.google.com/?v=1', 'http://www.google.com/?v=3']);
        done();
    });

    it('row params 2nd', function (done) {  
        assert.deepEqual(
            HTTP_EXPAND.toUrls(
                {endpoint: 'http://www.google.com/?v={y}', pRef: {value: 1}},
                [{events: [{x: 1}, {x: 3}]}, {events: [{y: 'z'}]}, {events: []}]),
            ['http://www.google.com/?v=z']);
        done();
    });


});
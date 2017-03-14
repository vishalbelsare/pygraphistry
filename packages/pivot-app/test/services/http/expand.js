import express from 'express';
import { assert } from 'chai';

import { HTTP_EXPAND } from '../../../src/shared/services/templates/http/httpExpand';


describe('HttpExpand', function () {

    let server;
    beforeEach(function() {
        const expressApp = express();       
        expressApp.get('/echo', function(req, res) {
            res.status(200).json(req.query);
        });
        expressApp.get('/timeout', () => {});
        expressApp.get('/404', (req, res) => res.status(404).json({}));
        server = expressApp.listen(3000);       
    });

    afterEach(function () {
        server.close();
    });


    ////////////////////////////////

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
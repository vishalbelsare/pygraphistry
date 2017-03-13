import express from 'express';
import { assert } from 'chai';
import mkdirp from 'mkdirp';
import { Observable } from 'rxjs';
import request from 'request';
const get = Observable.bindNodeCallback(request.get.bind(request));

import { HttpConnector, httpConnector0 } from '../../../src/shared/services/connectors/http';

const PORT = 3002;

describe('HttpConnector', function () {

    let timeout;
    beforeEach(function () {
		timeout = httpConnector0.timeout_s;
		httpConnector0.timeout_s = 0.05;
    })
	afterEach(function () {
		httpConnector0.timeout_s = timeout;
	});


    let server;
    let expressApp;
	beforeEach(function() {

		expressApp = express();		
	    expressApp.get('/echo', function(req, res) {
	        res.status(200).json(req.query);
	    });
	    expressApp.get('/timeout', () => {});
	    expressApp.get('/404', (req, res) => res.status(404).json({}));
	    server = expressApp.listen(PORT);	    
	});

	afterEach(function () {
		server.close();
	});


	////////////////////////////////

	it('testEcho', (done) => {
		get(`http://localhost:${PORT}/echo?x=1`)
			.subscribe(
				([response]) => { 
					assert.deepEqual(JSON.parse(response.body), {x: '1'})
					done();
				}, (v) => done(new Error({v})) );
	});
	
	it('search', (done) => {
		httpConnector0
			.search(`http://localhost:${PORT}/echo?x=1`)
			.subscribe(
				([response]) => { 
					assert.deepEqual(JSON.parse(response.body), {x: '1'})
					done();
				}, (v) => done(new Error({v})) );
	});

	it('timeout', (done) => {
		httpConnector0
			.search(`http://localhost:${PORT}/timeout`)
			.subscribe(
				() => done(new Error('expected timeout')),
				(e) => e && e.name === 'Timeout' ? done() 
					: done({msg: 'non-timeout exception', e}));
	});

	it('404', (done) => {
		httpConnector0
			.search(`http://localhost:${PORT}/404`)
			.subscribe(
				() => done(new Error('expected 404')),
				(e) => e && e.name === 'HttpStatusError' ? done() 
					: done({msg: 'non-404 exception', e}));
	});

	
	it('healthcheck', (done) => {
		httpConnector0.healthCheck()
			.subscribe((v) => {
					assert.deepEqual(v, 'Health checks passed');
					done();
				}, (e) => done(new Error(e)));			
	});

	
});	
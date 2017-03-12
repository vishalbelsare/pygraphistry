import express from 'express';
import { assert } from 'chai';
import mkdirp from 'mkdirp';
import { Observable } from 'rxjs';
import request from 'request';
const get = Observable.bindNodeCallback(request.get.bind(request));

import { HTTP_SEARCH } from '../../../src/shared/services/templates/http/httpSearch';


describe('HttpSearch', function () {

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

	it('simple', (done) => {	
		assert.deepEqual(
			HTTP_SEARCH.toUrls({endpoint: 'http://www.google.com'}),
			['http://www.google.com']);
		done();
	});


});
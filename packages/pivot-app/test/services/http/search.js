import express from 'express';
import { assert } from 'chai';
import mkdirp from 'mkdirp';
import { Observable } from 'rxjs';
import request from 'request';
const get = Observable.bindNodeCallback(request.get.bind(request));

import { HTTP_SEARCH } from '../../../src/shared/services/templates/http/httpSearch';

describe('HttpSearch', function () {

	it('simple', (done) => {	
		assert.deepEqual(
			HTTP_SEARCH.toUrls({endpoint: 'http://www.google.com'}),
			[{url: 'http://www.google.com', params: {endpoint: 'http://www.google.com'}}]);
		done();
	});

});
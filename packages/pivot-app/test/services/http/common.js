import { assert } from 'chai';
import mkdirp from 'mkdirp';

import { bindTemplateString } from '../../../src/shared/services/templates/http/common';


function testBindTemplateString(name, str, event, params, out) {
	it(name, (done) => {
		const url = bindTemplateString(str, event, params);
		assert.deepEqual(url, out);
		done();
	});
}


describe('bindTemplateString', function () {

	testBindTemplateString('identity', 'xyz', undefined, undefined, 'xyz');
	testBindTemplateString('event param', 'xy{a}z', {'a': 23}, undefined, 'xy23z');
	testBindTemplateString('event param dbl', 'xy{a}z{a}', {'a': 23}, undefined, 'xy23z23');
	testBindTemplateString('pivot param', 'xy{a}z', undefined, {'a': 23}, 'xy23z');
	testBindTemplateString('pivot param dbl', 'xy{a}z{a}', undefined, {'a': 23}, 'xy23z23');
	testBindTemplateString('whitespace', 'xy{ a   }z', {'a': 23}, undefined, 'xy23z');
	
});	
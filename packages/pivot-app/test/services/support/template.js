import { assert } from 'chai';
import mkdirp from 'mkdirp';

import { template } from '../../../src/shared/services/support/template';


function testTemplate(name, str, params, output) {
	it(name, (done) => {
		assert.deepEqual(template(str, params), output);
		done();
	});
}


describe('Template strings', function () {


	testTemplate('identity, undef params', 'zz', undefined, 'zz');
	testTemplate('identity, empty params', 'zz', {}, 'zz');

	testTemplate('single param', 'zz{x}yy', {x: 'asdf'}, 'zzasdfyy');
	testTemplate('repeat', 'zz{x}yy{x}aa', {x: 'asdf'}, 'zzasdfyyasdfaa');
	testTemplate('multiparam', 'zz{x}yy{y}aa', {x: 'asdf', y: 'fdsa'}, 'zzasdfyyfdsaaa');

	it('exn for missing param', function (done) {
		try {
			template('adsf{x}asdf', {});
			done('Expected exn');
		} catch (e) {
			done();
		}		
	});
	
});	
import { assert } from 'chai';
import { readFileSync } from 'fs';
import { EOL } from 'os';
import { resolve, } from 'path';

import { jq, jqSafe } from '../../../src/shared/services/support/jq';


function jqCompare(done, expected, str, transform, opts, f = jq) {
	f(str, transform, opts)
		.subscribe((out) => {
				assert.deepEqual(out, expected);
				done();
			},
			(e) => done(e||new Error()));
}

function jqExpectError(done, str, transform, opts, f = jq) {
	f(str, transform, opts)
		.subscribe(
			() => done(new Error()),
			() => done());
}


describe('jq', function () {

	it('Simple file', (done) => {

		const str = JSON.stringify({x: 1});
		const transform = '.';
		const expected = {x: 1};

		jqCompare(done, expected, str, transform);
	});

	it('Stream', (done) => {

		const str = JSON.stringify({x: 1}) + EOL + JSON.stringify({x: 2});
		const transform = '.';
		const opts = '-s';
		const expected = [{x: 1},{x: 2}];

		jqCompare(done, expected, str, transform, opts);
	});

	it('Transform', (done) => {

		const str = JSON.stringify({x: 1}) + EOL + JSON.stringify({x: 2});
		const transform = '[.[] | .x]';
		const opts = '-s';
		const expected = [1,2];

		jqCompare(done, expected, str, transform, opts);
	});

	it('Variable', (done) => {

		const str = JSON.stringify({x: 1, y: 'a'});
		const transform = '.x as $z | {z: $z, y: .y}';
		const expected = {z: 1, y: 'a'};

		jqCompare(done, expected, str, transform);
	});

	it('Command parse error', (done) => {

		const str = JSON.stringify({x: 1, y: 'a'});
		const transform = '.|.|';

		jqExpectError(done, str, transform);
	});

	it('Json parse error', (done) => {

		const str = JSON.stringify({x: 1, y: 'a'});
		const transform = '.|.|';

		jqExpectError(done, str, transform);
	});	

	
	it('Big file', (done) => {

		const contents = readFileSync(resolve(__dirname, 'blah.json'), 'utf8');
		const json = JSON.parse(contents);

		const str = contents;
		const transform = '.matches';
		const expected = json.matches;

		jqCompare(done, expected, str, transform);
	});

	it('Emoji', (done) => {
		const str = JSON.stringify({x: '🚀'});
		const transform = '.';
		const expected = {x: '🚀'};

		jqCompare(done, expected, str, transform);
	});

	it('Simple file (safe)', (done) => {

		const str = JSON.stringify({x: 1});
		const transform = '.';
		const expected = {x: 1};

		jqCompare(done, expected, str, transform, undefined, jqSafe);
	});

	it('Blacklist includes', (done) => {

		const str = JSON.stringify({x: 1, y: 'a'});
		const transform = '. | {"include": 1}';

		jqExpectError(done, str, transform, undefined, jqSafe);
	});

	it('Blacklist imports', (done) => {

		const str = JSON.stringify({x: 1, y: 'a'});
		const transform = '. | {"import": 1}';

		jqExpectError(done, str, transform, undefined, jqSafe);
	});
	

});
var vgraph = require('viz-app/server/etl/vgraph.js');

const { confirmType } = vgraph;

describe('confirmType', function() {

	describe('empty', function () {

		['string', 'double', 'integer', 'empty'].forEach(
			(wrongType) => 
				describe(wrongType, function () {

					it('handles no record', function () {
						assert.equal(confirmType(wrongType, [], 'z'), 'empty');
					});
					it('handles empty record', function () {
						assert.equal(confirmType(wrongType, [{}], 'z'), 'empty');
					});
					it('handles undefined field', function () {
						assert.equal(confirmType(wrongType, [{z: undefined}], 'z'), 'empty');
					});
					it('handles null field', function () {
						assert.equal(confirmType(wrongType, [{z: null}], 'z'), 'empty');
					});	
				}));
	});


	describe('int', function () {

		['string', 'integer', 'double', 'empty'].forEach(
			(wrongType) =>
				describe(wrongType, function () {

					it('handles single int', function () {
						assert.equal(confirmType(wrongType, [{z: 1}], 'z'), 'integer');
					});


					it('handles single int str', function () {
						assert.equal(confirmType(wrongType, [{z: '1'}], 'z'), 'integer');
					});


					it('mixed nulls', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: 1}, {}, {z: null}], 'z'), 'integer');
					});

					it('mixed nulls str', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: '1'}, {}, {z: null}], 'z'), 'integer');
					});					

				}));

	});

	describe('double', function () {

		['string', 'integer', 'double', 'empty'].forEach(
			(wrongType) =>
				describe(wrongType, function () {

					it('handles single double', function () {
						assert.equal(confirmType(wrongType, [{z: 1.5}], 'z'), 'double');
					});

					it('handles single str', function () {
						assert.equal(confirmType(wrongType, [{z: '1.5'}], 'z'), 'double');
					});


					it('mixed nulls', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: 1.5}, {}, {z: null}], 'z'), 'double');
					});
					it('mixed str', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: '1.5'}, {}, {z: null}], 'z'), 'double');
					});


					it('mixed numbers 1', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: 1.5}, {}, {z: 2}], 'z'), 'double');
					});					

					it('mixed numbers 2', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: 1}, {}, {z: 2.5}], 'z'), 'double');
					});		

					it('mixed numbers 3', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: 1}, {}, {z: 2.5}, {z: '3.5'}, {z: '2'}], 'z'), 'double');
					});					

				}));
		
	});	

	describe('string', function () {

		['string', 'integer', 'double', 'empty'].forEach(
			(wrongType) =>
				describe(wrongType, function () {

					it('handles single string', function () {
						assert.equal(confirmType(wrongType, [{z: 'z1.5'}], 'z'), 'string');
					});

					it('mixed nulls', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: 'z1.5'}, {}, {z: null}], 'z'), 'string');
					});

					it('mixed numbers', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: 'z1.5'}, {}, {z: 2.5}], 'z'), 'string');
					});					

					it('mixed integer', function () {
						assert.equal(confirmType(wrongType, [{z: null}, {z: 'z1.5'}, {}, {z: 2}], 'z'), 'string');
					});					

				}));
		
	});		

});


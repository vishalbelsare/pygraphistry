const objs  = require('viz-app/worker/services/labels/sort');
const { mostImportantEntityKeys, mostImportantEventKeys, selectImportantKeys } = objs;


// [ {key} ] * [ {key} ] * String -> ()
function compareOrder(actual, expected, {key: indicatorKey, value: indicatorValue}) {

	if (!actual || !expected) {
		return assert.deepEqual(actual, expected);
	}
	
	const expectedFlat = 
		expected
			.filter(({key, value}) => key != indicatorKey && value != indicatorValue)
			.map(({key}) => key);
	
	const actualFlat = 
		actual
			.filter(({key, value}) => key != indicatorKey && value != indicatorValue)
			.map(({key}) => key);
	
	return assert.deepEqual(expectedFlat, actualFlat);

}




describe('sort', () => {
	
	it('handles empty', (done) => {
		assert.deepEqual(selectImportantKeys([]), undefined);
		done();
	});


	it('handles event nodes - EventID', (done) => {

		const key = {key: 'type', value: 'EventID'}
		const expectedOrder = 
			[ mostImportantEventKeys[0], mostImportantEventKeys[1], mostImportantEventKeys[2]]
				.map((k, i) => ({key: k, value: i}))
				.concat([key])
		const reverse = expectedOrder.slice().reverse();

		compareOrder(selectImportantKeys(reverse), expectedOrder, key);
		done();
	});

	it('handles event edges - EventID->', (done) => {

		const key = {key: 'edgeType', value: 'EventID->x'}
		const expectedOrder = 
			[ mostImportantEventKeys[0], mostImportantEventKeys[1], mostImportantEventKeys[2]]
				.map((k, i) => ({key: k, value: i}))
				.concat([key])
		const reverse = expectedOrder.slice().reverse();

		compareOrder(selectImportantKeys(reverse), expectedOrder, key);
		done();
	});


	it('handles event edges - EventID-&gt;', (done) => {

		const key = {key: 'edgeType', value: 'EventID-&gt;x'}
		const expectedOrder = 
			[ mostImportantEventKeys[0], mostImportantEventKeys[1], mostImportantEventKeys[2] ]
				.map((k, i) => ({key: k, value: i}))
				.concat([key]);
		const reverse = expectedOrder.slice().reverse();

		compareOrder(selectImportantKeys(reverse), expectedOrder, key);
		done();
	});

	it('handles entities', (done) => {

		const key = {key: 'canonicalType', value: 'x'};
		const expectedOrder = 
			[ mostImportantEntityKeys[0], mostImportantEntityKeys[1], mostImportantEntityKeys[2] ]
				.map((k, i) => ({key: k, value: i}))
				.concat([key]);
		const reverse = expectedOrder.slice().reverse();

		compareOrder(selectImportantKeys(reverse), expectedOrder, key);
		done();
	});

	it('handles untyped', (done) => {

		const arr = [{key: 'a'}, {key: 'c'}, {key: 'b'}];
		compareOrder(selectImportantKeys(arr), undefined, {});
		done();
	});

});

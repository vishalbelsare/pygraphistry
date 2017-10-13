import { dateToUTCGenerator } from 'viz-app/worker/simulator/libs/dateToUTCGenerator';

const timeUTCInt = 1501647415407;
const timeUTCStr = new Date(timeUTCInt).toISOString();

describe('dateToUTCGenerator', function() {
    const numItems = 1000000;
    const maxDurationMS = 1 * 1000;

    const manyInts = [];
    const manyStrs = [];
    for (var i = 0; i < 100000; i++) {
        manyInts.push(timeUTCInt);
        manyStrs.push(timeUTCStr);
    }

    [
        ['milliseconds sample', timeUTCInt],
        ['seconds sample', timeUTCInt / 1000],
        ['NaN sample', 1 / 0],
        ['string sample', timeUTCStr],
        ['bad string sample', 'asdf'],
        ['null', null]
    ].forEach(function([seedName, seedVal]) {
        describe(seedName, function() {
            var f = dateToUTCGenerator(seedVal);

            it('handles valid ints', function() {
                assert.equal(f(timeUTCInt), timeUTCInt);
            });

            it('handles valid strs', function() {
                assert.equal(f(timeUTCStr), timeUTCInt);
            });

            it('rejects invalid ints', function() {
                assert.equal(f(-1), seedName === 'seconds sample' ? -1000 : -1);
            });

            it('rejects invalid strs', function() {
                assert.equal(Number.isNaN(f('asdf')), true);
            });
        });
    });

    [
        ['quickly handles ints', manyInts, dateToUTCGenerator(timeUTCInt)],
        ['quickly handles strs', manyStrs, dateToUTCGenerator(timeUTCStr)]
    ].forEach(function([speedName, speedArr, f]) {
        it(speedName, function() {
            const t0 = Date.now();
            for (var i = 0; i < speedArr.length; i++) {
                f(speedArr[i]);
            }
            const t1 = Date.now();
            assert.isAtMost(t1 - t0, maxDurationMS);
        });
    });
});

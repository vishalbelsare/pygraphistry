describe('server', function() {
    describe('vgraph', function() {
        require('./server/etl/vgraph.js');
    });
});

describe('worker', function() {
    describe('dateToUTCGenerator', function() {
        require('./worker/simulator/libs/dateToUTCGenerator.js');
    });
    describe('services', function() {
        require('./worker/services/labels/sort.js');
    });
});

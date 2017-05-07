global.__SERVER__ = true;
global._ = require('underscore');
global.Rx = require('rxjs');
global.Observable = Rx.Observable;

describe('Misc', function() {
    require('./misc/mochaSetup');
});

describe('Models', function() {
    require('./models/');
});

describe('Services', function() {
    require('./services/simpleFileSystemStore');
    require('./services/uploadGraph');
    require('./services/pivotStore');
    require('./services/shapeSplunkResults');
});

describe('HttpConnector', function() {
    require('./services/http/connector');
    require('./services/http/pivot');
    require('./services/http/search');
    require('./services/http/expand');
});

describe('Pivots', function () {
    require('./services/pivots/template');
    require('./services/pivots/manual');
})

describe('Support', function() {
    require('./services/support/flattenJson');
    require('./services/support/template');
    require('./services/support/jq');
    require('./services/support/mergeByKey');
});

describe('Shaping', function() {
    require('./services/shape/df');
    require('./services/shape/graph');
});

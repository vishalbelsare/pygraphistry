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
});

describe('HttpConnector', function() {
    require('./services/http/connector');
    require('./services/http/pivot');
    require('./services/http/search');
    require('./services/http/expand');
});

describe('OtherPivots', function () {
    require('./services/pivots/manual');
})

describe('Support', function() {
    require('./services/support/flattenJson');
});

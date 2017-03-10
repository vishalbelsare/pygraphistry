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
    require('./services/http/common');
});

describe('Support', function() {
    require('./services/support/flattenjson');
});

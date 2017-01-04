global.__SERVER__ = true;

describe('Misc', function() {
    require('./misc/mochaSetup');
});

describe('Models', function() {
    require('./models/');
});

describe('Services', function() {
    require('./services/simpleFileSystemStore');
});

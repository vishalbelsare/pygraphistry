'use strict';

var logger = require('../logger.js');
var test = require('./test.js'); //run test.js first
var log = logger.createLogger('test3');

//these have the "bar" field in metadata
log.trace('Hello world!');
log.debug('Hello world!');
log.info('Hello world!');
log.warn('Hello world!');
log.error('Hello world!');

logger.addMetadataField({ bar: 'asdf' });

//these don't have the "bar" field in metadata
log.trace('Hello world!');
log.debug('Hello world!');
log.info('Hello world!');
log.warn('Hello world!');
log.error('Hello world!');

test.log.trace('Hello World from another logger!'); //to test that different loggers maintain their namespace/module names

log.info(new Error('Hello'), 'hello2'); //how does bunyan handle error objects? look into the standard error serializer and err.js

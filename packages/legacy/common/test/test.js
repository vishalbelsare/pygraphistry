'use strict';

var logger = require('../logger.js');
var log = logger.createLogger('test');
var log2 = logger.createLogger('test2');

logger.addMetadataField({ bar: 'md' });

//base case
log.trace('Hello world!');
log.debug('Hello world!');
log.info('Hello world!');
log.warn('Hello world!');
log.error('Hello world!');

//these also include the "bar" field in metadata
log2.trace('Hello world!');
log2.debug('Hello world!');
log2.info('Hello world!');
log2.warn('Hello world!');
log2.error('Hello world!');

module.exports = {
    log: log
};

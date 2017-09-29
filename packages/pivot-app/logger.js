const bunyan = require('bunyan');
const convict = require('./config');
const parentLogger = createServerLogger({
    LOG_FILE: convict.get('log.file'),
    LOG_LEVEL: convict.get('log.level'),
    LOG_SOURCE: convict.get('log.logSource'),
});

////////////////////////////////////////////////////////////////////////////////
// Exports
//
// We export functions for creating module-level loggers, setting global metadata, and convienance
// functions for creating error handler functions that log the error and rethrow it.
////////////////////////////////////////////////////////////////////////////////

function createLogger(fileName) {
    return parentLogger.child({fileName});
}

createLogger.createLogger = createLogger;

module.exports = createLogger;
module.exports.default = createLogger;

function createServerLogger({LOG_LEVEL, LOG_FILE, LOG_SOURCE}) {
    const serializers = bunyan.stdSerializers;

    // Always starts with a stream that writes fatal errors to STDERR
    let streams = [];

    if (typeof LOG_FILE === 'undefined') {
        streams = [{ name: 'stdout', stream: process.stdout, level: LOG_LEVEL }];
    } else {
        streams = [
            { name: 'fatal', stream: process.stderr, level: 'fatal' },
            { name: 'logfile', path: LOG_FILE, level: LOG_LEVEL }
        ];
    }

    const logger = bunyan.createLogger({
        src: LOG_SOURCE,
        name: 'pivot-app',
        serializers: serializers,
        streams: streams
    });

    //add any additional logging methods here
    logger.die = function(err, msg) {
        logger.fatal(err, msg);
        logger.fatal('Exiting process with return code of 60 due to previous fatal error');
        process.exit(60);
    };

    process.on('SIGUSR2', function () {
        logger.reopenFileStreams();
    });

    return logger;
}


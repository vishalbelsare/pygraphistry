'use strict';

var bunyan = require('bunyan');
var _ = require('underscore');
var config = require('config')();

////////////////////////////////////////////////////////////////////////////////
// Parent logger
//
// A global singleton logger that all module-level loggers are children of.
////////////////////////////////////////////////////////////////////////////////

function createParentLogger() {

    // Always starts with a stream that writes fatal errors to STDERR
    var streams = [];

    if(_.isUndefined(config.LOG_FILE)) {
        streams = [{ name: 'stdout', stream: process.stdout, level: config.LOG_LEVEL }];
    } else {
        streams = [
            { name: 'fatal', stream: process.stderr, level: 'fatal' },
            { name: 'logfile', path: config.LOG_FILE, level: config.LOG_LEVEL }
        ];
    }

    return bunyan.createLogger({
        src: config.LOG_SOURCE,
        name: 'graphistry',
        metadata: {
            userInfo: { }
        },
        streams: streams
    });
}


var parentLogger = createParentLogger();


//add any additional logging methods here

parentLogger.die = function(err, msg) {
    parentLogger.fatal(err, msg);
    parentLogger.fatal('Exiting process with return code of 60 due to previous fatal error');
    process.exit(60);
};

process.on('SIGUSR2', function () {
    parentLogger.reopenFileStreams();
});


////////////////////////////////////////////////////////////////////////////////
// Exports
//
// We export functions for creating module-level loggers, setting global metadata, and convienance
// functions for creating error handler functions that log the error and rethrow it.
////////////////////////////////////////////////////////////////////////////////

module.exports = {
    createLogger: function(name) {
        return (function () {
            var childLogger = parentLogger.child({module: name}, true);

            //add any additional logging methods here

            childLogger.die = function childLoggerDie(err, msg) {
                childLogger.fatal(err, msg);
                process.exit(1);
            };

            childLogger.makeQErrorHandler = function childLoggerMakeQErrorHandler(msg) {
                return module.exports.makeQErrorHandler(childLogger, msg);
            };

            childLogger.makeRxErrorHandler = function childLoggerMakeRxErrorHandler(msg) {
                return module.exports.makeRxErrorHandler(childLogger, msg);
            };

            return childLogger;
        })();
    },

    addMetadataField: function(metadata) {
        //metadata is global, same for all loggers
        if(!_.isObject(metadata)) { throw new Error('metadata must be an object'); }
        return _.extend(parentLogger.fields.metadata, metadata);
    },

    addUserInfo: function(newUserInfo) {
        return _.extend(parentLogger.fields.metadata.userInfo, newUserInfo);
    },

    makeRxErrorHandler: function(childLogger, msg) {
        //This should return a function that takes an error as an argument and logs a formatted version of it.
        return function(err) {
            childLogger.error(err, msg);
        };
    },

    makeQErrorHandler: function(childLogger, msg) {
        //This should return a function that takes an error as an argument and logs a formatted version of it, and rethrows the error.
        var args = Array.prototype.slice.call(arguments)
        var shifted = args.shift();
        return function(err) {
            args.unshift(err);
            childLogger.error.apply(childLogger, args);
            throw err;
        };
    }
};


////////////////////////////////////////////////////////////////////////////////
// Global error handlers
////////////////////////////////////////////////////////////////////////////////

var SegfaultHandler = require('segfault-handler');
SegfaultHandler.registerHandler();


////////////////////////////////////////////////////////////////////////////////
// `config` module logging
//
// Since logger depends on config, config is unable to log errors using logger. We get around this
// problem by having config save errors internally, then having logger check if config has
// saved any errors and, if so, writing log messages about them here.
////////////////////////////////////////////////////////////////////////////////

var configLogger = module.exports.createLogger('config');
var configErrors = config.getErrors(true);

if(_.isArray(configErrors) && configErrors.length > 0) {
    for(var ceIdx = 0; ceIdx < configErrors.length; ceIdx++) {
        configLogger.error(configErrors[ceIdx], 'Config error');
    }
}


if(_.isUndefined(process.env.didLogConfig) || process.env.didLogConfig !== true) {
    configLogger.debug({config: config}, 'Config options resolved');
    process.env.didLogConfig = true;
}

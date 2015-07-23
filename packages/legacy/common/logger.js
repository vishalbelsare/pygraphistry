'use strict';

var bunyan = require('bunyan');
var _ = require('underscore');
var config = require('config')();


////////////////////////////////////////////////////////////////////////////////
// Error serializer
//
// A custom Bunyan serializer for `err` fields. Acts exactly like the regular Bunyan err serializer,
// except that the stack trace of the error is made an array by splitting the string on newlines.
////////////////////////////////////////////////////////////////////////////////

/*
 * This function dumps long stack traces for exceptions having a cause()
 * method. The error classes from
 * [verror](https://github.com/davepacheco/node-verror) and
 * [restify v2.0](https://github.com/mcavage/node-restify) are examples.
 *
 * Based on `dumpException` in
 * https://github.com/davepacheco/node-extsprintf/blob/master/lib/extsprintf.js
 */
 //modified to display stack as array of strings
function getFullErrorStack(ex)
{
    var ret = ex.stack || ex.toString();
    if (ex.cause && typeof (ex.cause) === 'function') {
        var cex = ex.cause();
        if (cex) {
            ret += '\nCaused by: ' + getFullErrorStack(cex);
        }
    }
    ret = ret.split('\n');
    ret.forEach(function(element, index, array) {
        array[index] = element.trim();
    });

    return ret;
}

// Serialize an Error object
// (Core error properties are enumerable in node 0.4, not in 0.6).
// Modified error serializer
bunyan.stdSerializers.err = function bunyanErrSerializer(e) {
    if (!e || !e.stack) {
        return e;
    }
    var obj = {
        message: e.message,
        name: e.name,
        stack: getFullErrorStack(e),
        code: e.code,
        signal: e.signal
    };
    return obj;
};


////////////////////////////////////////////////////////////////////////////////
// Parent logger
//
// A global singleton logger that all module-level loggers are children of.
////////////////////////////////////////////////////////////////////////////////

var parentLogger;

if(_.isUndefined(config.BUNYAN_LOG)) {
    parentLogger = bunyan.createLogger({
        name: 'graphistry',
        metadata: {
            userInfo: { tag: 'unknown' }
        },
        serializers: bunyan.stdSerializers,
        level: config.BUNYAN_LEVEL
    });
} else {
    parentLogger = bunyan.createLogger({
        name: 'graphistry',
        metadata: {
            userInfo: { tag: 'unknown' }
        },
        serializers: bunyan.stdSerializers,
        streams: [{
            path: config.BUNYAN_LOG,
            level: config.BUNYAN_LEVEL,
        }]
    });
}



//add any additional logging methods here

parentLogger.die = function(err, msg) {
    parentLogger.fatal(err, msg);
    process.exit(1);
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

            childLogger.die = function(err, msg) {
                childLogger.fatal(err, msg);
                process.exit(1);
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
        return function(err) {
            childLogger.error(err, msg);
            throw err;
        };
    }
};


////////////////////////////////////////////////////////////////////////////////
// Global error handlers
////////////////////////////////////////////////////////////////////////////////

var SegfaultHandler = require('segfault-handler');
SegfaultHandler.registerHandler();


// Use `once` instead of `on`, since presumably this error is fatal and so this should only ever be
// called once. This allows us to rethrow the error without getting caught in a loop.
process.once('uncaughtException', function(uncaughtErr) {
    console.error('Fatal Error: uncaught exception! Error:', uncaughtErr);

    // TODO: If we exit immediately (or rethrow the error to cause Node to exit immediately), are
    // we sure that the fs write to the log file (via Bunyan) will write this log message?
    parentLogger.fatal(uncaughtErr, 'Globally uncaught exception');

    // Rethrow the exception so it can be suitably fatal
    throw uncaughtErr;
});


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
    configLogger.debug('Program options resolved to:', config);
    process.env.didLogConfig = true;
}

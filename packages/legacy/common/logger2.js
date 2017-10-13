/*
 * COPY OF LOGGER.JS WITHOUT CONFIG DEPENDENCY FOR PIVOT-APP
 */

'use strict';

var bunyan = require('@graphistry/bunyan');
var _ = require('underscore');

function inBrowser() {
    return typeof window !== 'undefined' && window.window === window;
}

////////////////////////////////////////////////////////////////////////////////
// Error serializer
//
// A custom Bunyan serializer for `err` fields. Acts exactly like the regular Bunyan err serializer,
// except that the stack trace of the error is made an array by splitting the string on newlines.
////////////////////////////////////////////////////////////////////////////////

var _stackRegExp = /at (?:(.+)\s+)?(?:\()?(?:(.+?):(\d+):(\d+)|([^)]+))(?:\))?/;

function getFullErrorStack(ex) {
    var framesStr = (ex.stack || ex.toString()).split('\n');
    var framesObj = [];

    for (var i = 1; i < framesStr.length; i++) {
        var matches = framesStr[i].match(_stackRegExp);

        if (matches) {
            framesObj.push({
                file: matches[2] || null,
                line: parseInt(matches[3], 10) || null,
                column: parseInt(matches[4], 10) || null,
                function: matches[1] || null
            });
        }
    }

    return framesObj;
}

// Serialize an Error object
// (Core error properties are enumerable in node 0.4, not in 0.6).
// Modified error serializer
function errSerializer(e) {
    if (!e || !e.stack) {
        return e;
    }

    var obj = bunyan.stdSerializers.err(e);
    obj.stackArray = getFullErrorStack(e);

    if (e.cause && typeof e.cause === 'function') {
        obj.cause = errSerializer(e.cause);
    }

    return obj;
}

function BrowserConsoleStream() {
    this.levelToConsole = {
        trace: 'debug',
        debug: 'debug',
        info: 'info',
        warn: 'warn',
        error: 'error',
        fatal: 'error'
    };

    this.fieldsToOmit = [
        'v',
        'name',
        'fileName',
        'pid',
        'hostname',
        'level',
        'module',
        'time',
        'msg'
    ];
}

BrowserConsoleStream.prototype.write = function(rec) {
    const levelName = bunyan.nameFromLevel[rec.level];
    const method = this.levelToConsole[levelName];
    const prunedRec = _.omit(rec, this.fieldsToOmit);

    if (_.isEmpty(prunedRec)) {
        console[method](rec.msg);
    } else if ('err' in prunedRec) {
        console[method](rec.err, rec.msg);
    } else {
        console[method](prunedRec, rec.msg);
    }
};

////////////////////////////////////////////////////////////////////////////////
// Parent logger
//
// A global singleton logger that all module-level loggers are children of.
////////////////////////////////////////////////////////////////////////////////

function createServerLogger() {
    var serializers = _.extend({}, bunyan.stdSerializers, {
        err: errSerializer
    });

    // Always starts with a stream that writes fatal errors to STDERR
    var streams = [];

    if (_.isUndefined(process.env.LOG_FILE)) {
        streams = [{ name: 'stdout', stream: process.stdout, level: process.env.LOG_LEVEL }];
    } else {
        streams = [
            { name: 'fatal', stream: process.stderr, level: 'fatal' },
            { name: 'logfile', path: process.env.LOG_FILE, level: process.env.LOG_LEVEL }
        ];
    }

    const logger = bunyan.createLogger({
        src: process.env.LOG_SOURCE,
        name: 'graphistry',
        metadata: {
            userInfo: {}
        },
        serializers: serializers,
        streams: streams
    });

    //add any additional logging methods here
    logger.die = function(err, msg) {
        logger.fatal(err, msg);
        logger.fatal('Exiting process with return code of 60 due to previous fatal error');
        process.exit(60);
    };

    process.on('SIGUSR2', function() {
        logger.reopenFileStreams();
    });

    return logger;
}

function createClientLogger() {
    return bunyan.createLogger({
        name: 'graphistry',
        streams: [
            {
                level: 'info',
                stream: new BrowserConsoleStream(),
                type: 'raw'
            }
        ]
    });
}

const parentLogger = inBrowser() ? createClientLogger() : createServerLogger();

////////////////////////////////////////////////////////////////////////////////
// Exports
//
// We export functions for creating module-level loggers, setting global metadata, and convienance
// functions for creating error handler functions that log the error and rethrow it.
////////////////////////////////////////////////////////////////////////////////

module.exports = {
    createLogger: function(module, fileName) {
        return (function() {
            var childLogger = parentLogger.child({ module: module, fileName: fileName }, true);

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
    }

    /* DEPRECATED
     *
    addMetadataField: function(metadata) {
        //metadata is global, same for all loggers
        if(!_.isObject(metadata)) { throw new Error('metadata must be an object'); }
        return _.extend(parentLogger.fields.metadata, metadata);
    },

    clearMetadataField: function (fields) {
        _.each(fields, function (field) { delete parentLogger.fields.metadata[field]; });
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
    },

    getFullErrorStack: getFullErrorStack


    */
};

'use strict';

var bunyan = require('bunyan');
var _ = require('underscore');
var config = require('config')();

//////////Error handler/serializer from bunyan, modified for our needs
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
        level: config.BUNYAN_LEVEL,
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

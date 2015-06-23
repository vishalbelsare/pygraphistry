'use strict';

/**
Goals with this logger:

1. Format error messages as the stack in an array of strings. 
From the Bunyan API:
log.info(err);  // Special case to log an `Error` instance to the record.
                // This adds an "err" field with exception details
                // (including the stack) and sets "msg" to the exception
                // message.
From the 'err' field, format 'stack' from "Exception:\n     TypeError..." into ["Exception", "TypeError"...]

2. Set metadata in logger. (Biggest concern so far...)
Metadata should be set as a variable storing an object with fields, e.g. {"uid":"1001","hostname":"111"...}
Files that use require('logger') should all use the same metadata object, which is where log.child comes in!
***MAKE SURE THAT***
You NEVER reassign metadata to a new object! You may only mutate it, e.g. redefine fields, add fields, or delete fields. 
Mutate the metadata using addMetadataField

3. Control location + level of the logger. Probably from CLI. Example can be from log.js, where you pass in this info as JSON.
e.g. '{"BUNYAN_LOG":"/This/Directory/Foo/Bar"}'

**/

var bunyan = require('bunyan');
var _ = require('underscore');
var config = require('../config')();

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
    ret = ret.split("\n");
    ret.forEach(function(element, index, array) {
        array[index] = element.trim();
    });
    
    return ret;
}

// Serialize an Error object
// (Core error properties are enumerable in node 0.4, not in 0.6).
// Modified error serializer
var errSerializer = bunyan.stdSerializers.err = function err(err) {
    if (!err || !err.stack)
        return err;
    var obj = {
        message: err.message,
        name: err.name,
        stack: getFullErrorStack(err),
        code: err.code,
        signal: err.signal
    }
    return obj;
};

var CONSOLE_DEBUG_LEVEL = parseInt(process.env.CONSOLE_DEBUG_LEVEL) || config.CONSOLE_DEBUG_LEVEL; //empty function prevents logger from logging to console
var BUNYAN_DEBUG_LEVEL = parseInt(process.env.BUNYAN_DEBUG_LEVEL) || config.BUNYAN_DEBUG_LEVEL; //defaults to 10 unless specified in command line or config

var parentLogger = config.BUNYAN_LOG !== undefined ? 
    bunyan.createLogger({
        name: "graphistry", 
        metadata: {},
        serializers: {
            err: bunyan.stdSerializers.err
        },
        level: CONSOLE_DEBUG_LEVEL,
        streams: [{
            path: config.BUNYAN_LOG,
            level: BUNYAN_DEBUG_LEVEL,
        }]
    }) : 
    //bunyan defaults to stdout if no stream is specified
    bunyan.createLogger({
        name: "graphistry", 
        metadata: {},
        serializers: {
            err: bunyan.stdSerializers.err
        },
        level: CONSOLE_DEBUG_LEVEL
    });

process.on('SIGUSR2', function () {
    l.reopenFileStreams();
});


module.exports = {
    createLogger: function(name) {
        return parentLogger.child({module: name}, true);
    },
    addMetadataField: function(metadata) {
        if(!_.isObject(metadata)) { throw new Error("metadata must be an object"); }
        return _.extend(parentLogger.fields.metadata, metadata);
    },
    makeErrorHandler: function(msg) {
        //This should return a function that takes an error as an argument and logs a formatted version of it.
        return parentLogger.child({msg: msg}, true).error;
    }
};

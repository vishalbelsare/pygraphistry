// This file is only used in the viz-client.js output. Viz-server still uses the original
// `@graphistry/common` logger. This is done via a WebPack module alias in viz-client's build.

import _ from 'lodash';
import bunyan from 'bunyan';


class BrowserConsoleStream {
    constructor() {
        this.levelToConsole = {
            'trace': 'debug',
            'debug': 'debug',
            'info': 'info',
            'warn': 'warn',
            'error': 'error',
            'fatal': 'error',
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

    write(rec) {
        const levelName = bunyan.nameFromLevel[rec.level];
        const method = this.levelToConsole[levelName];
        const prunedRec = _.omit(rec, this.fieldsToOmit);

        if (_.isEmpty(prunedRec)) {
            console[method](rec.msg);
        } else if ('err' in prunedRec){
            const e = new Error(rec.err.message);
            e.stack = rec.err.stack;
            rec.msg === rec.err.message ? console[method](e) : console[method](rec.msg, e);
        } else {
            console[method](rec.msg, prunedRec);
        }
    }
}

class BrowserForwarderStream{
    constructor() {}

    write(rec) {
        const ajax = new XMLHttpRequest();
        ajax.open('POST', '/error', true);
        ajax.setRequestHeader('Content-type', 'application/json');
        ajax.send(JSON.stringify(rec));
    }
}


////////////////////////////////////////////////////////////////////////////////
// Parent logger
//
// A global singleton logger that all module-level loggers are children of.
////////////////////////////////////////////////////////////////////////////////

// The parent logger is the parent of all other loggers. It sends all 'warn' or higher level
// messages to the server Metadata fields, etc. should be added to it, to ensure all subsequent log
// messages include those fields.
const parentLogger = bunyan.createLogger({
    name: 'viz-client',
    streams: [{
        level: 'warn',
        stream: new BrowserForwarderStream(),
        type: 'raw'
    }]
});


// The console logger is the parent of all of our app-code loggers (i.e., the parent of loggers
// created via `logger.createLogger()`). It logs all messages of a configured level or higher (by
// default 'info') to the browser console. Since it is a child of `parentLogger`, it also logs
// all >= 'warn' messages to the server as well.
const consoleLogLevel = window.localStorage.debugLevel || 'info';
const consoleLogger = parentLogger.child({
    streams: [{
        level: consoleLogLevel,
        stream: new BrowserConsoleStream(),
        type: 'raw'
    }]
});

export function createDirectLogger(module, filename) {
    return parentLogger.child({module, filename});
}


export function createLogger(module, fileName) {
    return consoleLogger.child({module, fileName}, true);
}


export function addMetadataField(metadata) {
    //metadata is global, same for all loggers
    if(!_.isObject(metadata)) { throw new Error('metadata must be an object'); }
    return _.extend(parentLogger.fields.metadata, metadata);
};


export function clearMetadataField(fields) {
    _.each(fields, function (field) { delete parentLogger.fields.metadata[field]; });
};


export function  addUserInfo(newUserInfo) {
    return _.extend(parentLogger.fields.metadata.userInfo, newUserInfo);
};

////////////////////////////////////////////////////////////////////////////////
// Browser error hooks
//
// Hook into window.onerror and console.error, and log them to the server.
////////////////////////////////////////////////////////////////////////////////


//
// // Track JavaScript errors
// // Use the new standard (2014+) to get stack from modern browsers
// // https://html.spec.whatwg.org/multipage/webappapis.html#errorevent
// window.onerror = function(message, file, line, col, error) {
//     parentLogger.error({err: error}, message);
// };

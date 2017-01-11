// This file is only used in the viz-client.js output. Viz-server still uses the original
// `@graphistry/common` logger. This is done via a WebPack module alias in viz-client's build.

import _ from 'lodash';
import bunyan from 'bunyan';


// Preserve the original console.* functions, in case they get monkey-patched elsewhere
export const originalConsole = window.originalConsole || _.merge({}, console);
window.originalConsole = originalConsole;

const levelToConsole = {
    'trace': 'debug',
    'debug': 'debug',
    'info': 'info',
    'warn': 'warn',
    'error': 'error',
    'fatal': 'error'
};

class BrowserConsoleStream {
    constructor() {
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
        const method = levelToConsole[levelName] || 'log';
        const prunedRec = _.omit(rec, this.fieldsToOmit);

        if (_.isEmpty(prunedRec)) {
            originalConsole[method](rec.msg);
        } else if ('err' in prunedRec){
            const e = new Error(rec.err.message);
            e.stack = rec.err.stack;
            rec.msg === rec.err.message ? originalConsole[method](e) : originalConsole[method](rec.msg, e);
        } else {
            originalConsole[method](rec.msg, prunedRec);
        }
    }
}


class BrowserForwarderStream{
    constructor() {}

    write(rec) {
        const ajax = new XMLHttpRequest();
        ajax.open('POST', '/error', true);
        ajax.setRequestHeader('Content-type', 'application/json');
        ajax.send(rec);
    }
}


////////////////////////////////////////////////////////////////////////////////
// Parent logger
//
// A global singleton logger that all module-level loggers are children of.
////////////////////////////////////////////////////////////////////////////////


// Normally pulled from window.localStorage, if set. However, since trying to use that API when it's
// not available can lead to a crash, add some extra logic to detect that and default to 'info'.
function getClientLogLevel() {
    // From https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
    try {
        var storage = window['localStorage'];
        var x = '__storage_test__';
        storage.setItem(x, x);
        storage.removeItem(x);

        return window.localStorage.debugLevel || 'info';
    }
    catch(e) {
        console.warn('Cannot read localStorage to set LOG_LEVEL, defaulting to "info"');
        return 'info';
    }
}


// The parent logger is the parent of all other loggers. It sends all 'warn' or higher level
// messages to the server Metadata fields, etc. should be added to it, to ensure all subsequent log
// messages include those fields.
const parentLogger = bunyan.createLogger({
    name: 'viz-client',
    streams: [{
        level: 'warn',
        stream: new BrowserForwarderStream(),
        type: 'stream'
    }]
});


// The console logger is the parent of all of our app-code loggers (i.e., the parent of loggers
// created via `logger.createLogger()`). It logs all messages of a configured level or higher (by
// default 'info') to the browser console. Since it is a child of `parentLogger`, it also logs
// all >= 'warn' messages to the server as well.
const consoleLogLevel = getClientLogLevel();
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
    parentLogger.fields.metadata = parentLogger.fields.metadata || {};
    return _.extend(parentLogger.fields.metadata, metadata);
}


export function clearMetadataField(fields) {
    _.each(fields, function (field) { delete parentLogger.fields.metadata[field]; });
}


export function addUserInfo(newUserInfo) {
    parentLogger.fields.metadata = parentLogger.fields.metadata || {};
    parentLogger.fields.metadata.userInfo = parentLogger.fields.metadata.userInfo || {};
    return _.extend(parentLogger.fields.metadata.userInfo, newUserInfo);
}

////////////////////////////////////////////////////////////////////////////////
// Browser error hooks
//
// Hook into window.onerror and console.error, and log them to the server.
////////////////////////////////////////////////////////////////////////////////

if(window.graphistryClientId) {
    addUserInfo({ cid: window.graphistryClientId });
}


//
// // Track JavaScript errors
// // Use the new standard (2014+) to get stack from modern browsers
// // https://html.spec.whatwg.org/multipage/webappapis.html#errorevent
// window.onerror = function(message, file, line, col, error) {
//     parentLogger.error({err: error}, message);
// };

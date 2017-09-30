/* eslint-disable no-console */
import _ from 'underscore';
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
        }

        this.fieldsToOmit = [
            'v',
            'name',
            'fileName',
            'pid',
            'hostname',
            'level',
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
        } else if ('err' in prunedRec) {
            const e = new Error(rec.err.message)
            e.stack = rec.err.stack;
            rec.msg === rec.err.message ? console[method](e) : console[method](rec.msg, e);
        } else {
            console[method](rec.msg, prunedRec);
        }
    }
}

class BrowserForwarderStream{
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

let parentLogger;

if (__SERVER__) {
    if (!(parentLogger = global.__graphistry_server_logger__)) {
        const conf = global.__graphistry_convict_conf__;
        parentLogger = createServerLogger({
            LOG_FILE: conf.get('log.file'),
            LOG_LEVEL: conf.get('log.level'),
            LOG_SOURCE: conf.get('log.logSource'),
        });
    }
} else {
    let logLevel;
    try {
        logLevel = window.localStorage.debugLevel || 'info';
    } catch (e) {
        console.info('Cannot read localStorage to set LOG_LEVEL, defaulting to "info"');
        logLevel = 'info';
    }
    parentLogger = createClientLogger({
        LOG_LEVEL: logLevel,
    });
}

function createServerLogger({LOG_LEVEL, LOG_FILE, LOG_SOURCE}) {
    const serializers = bunyan.stdSerializers;

    // Always starts with a stream that writes fatal errors to STDERR
    let streams = [];

    if(_.isUndefined(LOG_FILE)) {
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

function createClientLogger({ LOG_LEVEL }) {
    return bunyan.createLogger({
        name: 'pivot-app',
        streams: [
            {
                level: LOG_LEVEL,
                stream: new BrowserConsoleStream(),
                type: 'raw'
            },
            {
                level: 'warn',
                stream: new BrowserForwarderStream(),
                type: 'raw'
            }
        ]
    });
}


////////////////////////////////////////////////////////////////////////////////
// Exports
//
// We export functions for creating module-level loggers, setting global metadata, and convienance
// functions for creating error handler functions that log the error and rethrow it.
////////////////////////////////////////////////////////////////////////////////

export function createLogger(fileName, parent) {
    return (parent || parentLogger).child({fileName});
}

createLogger.createLogger = createLogger;

export default createLogger;

import _  from 'underscore';
import bunyan from 'bunyan';


function BrowserConsoleStream() {
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
        'module',
        'time',
        'msg'
    ];
}

BrowserConsoleStream.prototype.write = function (rec) {
    const levelName = bunyan.nameFromLevel[rec.level];
    const method = this.levelToConsole[levelName];
    const prunedRec = _.omit(rec, this.fieldsToOmit);

    if (_.isEmpty(prunedRec)) {
        console[method](rec.msg);
    } else if ('err' in prunedRec){
        console[method](rec.err, rec.msg);
    } else {
        console[method](prunedRec, rec.msg);
    }
}

////////////////////////////////////////////////////////////////////////////////
// Parent logger
//
// A global singleton logger that all module-level loggers are children of.
////////////////////////////////////////////////////////////////////////////////

var parentLogger;

if (__SERVER__) {
    const conf = require('../server/config.js');
    parentLogger = createServerLogger({
        LOG_FILE: conf.get('log.file'),
        LOG_LEVEL: conf.get('log.level'),
        LOG_SOURCE: conf.get('log.logSource'),
    });
} else {
    parentLogger = createClientLogger({
        LOG_LEVEL: window.localStorage.debugLevel || 'info',
    });
}

function createServerLogger({LOG_LEVEL, LOG_FILE, LOG_SOURCE}) {
    const serializers = bunyan.stdSerializers;

    // Always starts with a stream that writes fatal errors to STDERR
    var streams = [];

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
        name: 'graphistry',
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
        name: 'graphistry',
        streams: [
            {
                level: LOG_LEVEL,
                stream: new BrowserConsoleStream(),
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

module.exports = {
    createLogger: function(module, fileName) {
        return parentLogger.child({module, fileName});
    },
};

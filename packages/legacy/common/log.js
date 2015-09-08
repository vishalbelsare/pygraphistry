'use strict';


var nodeutil = require('util'),
    chalk    = require('chalk'),
    bunyan   = require('bunyan');


var self = module.exports = {
    // Save the real console
    secretConsole: {
        info: console.info,
        log: console.log,
        warn: console.warn,
        error: console.error,
        fatal: console.error,
        debug: console.log,
        trace: console.log
    },

    usertag: 'unknown',
    moduleName: undefined,
    logger: undefined,

    createLogger: function (config, moduleName) {
        self.moduleName = moduleName;

        if (config.BUNYAN_LOG) {
            self.logger = bunyan.createLogger({
                name: moduleName,
                streams: [
                    {
                        path: config.BUNYAN_LOG,
                        level: 10
                    },{
                        stream: process.stdout,
                        level: config.CONSOLE_DEBUG_LEVEL
                    }
                ]
            });

            process.on('SIGUSR2', function () {
                self.logger.reopenFileStreams();
            });
        }
    },

    setUserTag: function(tag) {
        self.usertag = tag;
    },

    error: function () {
        var msg = nodeutil.format.apply(this, arguments);
        self.makeHandler('ERROR', msg, 'error', false, chalk.bold.red)(new Error());
    },

    exception: function(err) {
        var otherArgs = Array.prototype.slice.call(arguments, 1);
        var msg = nodeutil.format.apply(this, otherArgs);
        self.makeHandler('ERROR', msg, 'error', false, chalk.bold.red)(err)
    },

    die: function() {
        var msg = nodeutil.format.apply(this, arguments);
        self.makeHandler('FATAL', msg, 'fatal', false, chalk.bold.red)(new Error());
        process.exit(1);
    },

    debug: function() {
        var msg = nodeutil.format.apply(this, arguments);
        self.makeHandler('DEBUG', msg, 'debug', false, chalk.inverse)();
    },

    trace: function() {
        var msg = nodeutil.format.apply(this, arguments);
        self.makeHandler('TRACE', msg, 'trace', false, chalk.bgYellow)();
    },

    warn: function () {
        var msg = nodeutil.format.apply(this, arguments);
        self.makeHandler('WARNING', msg, 'warn', false, chalk.yellow)(new Error());
    },

    info: function() {
        var msg = nodeutil.format.apply(this, arguments);
        self.makeHandler('INFO', msg, 'info', false, chalk.green)();
    },

    hijackConsole: function() {
        console.info = self.info;
        console.warn = self.warn;
        console.error = self.error;
    },

    makeHandler: function(type, msg, out, rethrow, style) {
        style = style || _.identity;

        return function (err) {
            var payload = error2JSON(self, type, msg, err);
            if (self.logger !== undefined) {
                self.logger[out]({content: payload});
            } else {
                var extra = payload.stack || payload.error || '';
                self.secretConsole[out](style(payload.type), payload.msg, extra);
            }

            if (rethrow) {
                throw new Error(msg);
            }
        }
    }
}


function error2JSON(self, type, msg, error) {
    var payload = {
        type: type,
        pid: process.pid.toString(),
        localTime: (new Date()).toString(),
        module: self.moduleName,
        tag: self.usertag,
        msg: msg
    }

    if (error && error.stack) {
        payload.stack = error.stack;
    } else if (error) {
        payload.error = error;
    } else {
        payload.catcher = (new Error()).stack;
    }

    return payload;
}

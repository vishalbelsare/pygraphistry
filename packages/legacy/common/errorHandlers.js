'use strict';


var nodeutil = require('util'),
    chalk    = require('chalk');

module.exports = function (log) {
    return {
        makeErrorHandler: function () {
            var msg = nodeutil.format.apply(this, arguments);
            return log.makeHandler('ERROR', msg, 'error', true, chalk.bold.red);
        },
        makeRxErrorHandler: function () {
            var msg = nodeutil.format.apply(this, arguments);
            return log.makeHandler('ERROR', msg, 'error', false, chalk.bold.red);
        }
    };
}

'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:Version');
var $       = window.$;
var util    = require('./util.js');

// Log server's version
//
// This is purely for logging diagnostics, as:
//   -- the UI's logo is printed via template
//   -- StreamGL knows its content hash (VERISON) via webpack
// Can potentially replace, or somehow read from template

function Version (socket) {

    console.info(`Graphistry client ${__VERSION__}`);

    socket.emit('get_version', null, function (response) {
        if (response.success) {
            console.info('Graphistry server', response.versions);
        } else {
            util.makeErrorHandler('get_version')(response.error);
        }
    });

}


module.exports = Version;

'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:Version');
var $       = window.$;
var util    = require('./util.js');

// Combine server's get_version with streamgl's VERSION (webpack) and print to DOM

function Version (socket) {

    console.info('Graphistry client', VERSION);

    socket.emit('get_version', null, function (response) {
        if (response.success) {
            console.info('Graphistry server', response.version);
            var v = 'v' + response.version;
            $('.logo-version').html(v);
        } else {
            util.makeErrorHandler('get_version')(response.error);
        }
    });

}


module.exports = Version;
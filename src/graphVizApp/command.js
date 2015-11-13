'use strict';

var Rx      = require('rx');
var debug   = require('debug')('graphistry:StreamGL:graphVizApp:command');


function Command(description, commandName, socket, disableErrorFiltering) {
    this.description = description;
    this.commandName = commandName;
    this.socket = socket;
    this.disableErrorFiltering = (disableErrorFiltering !== undefined) ?
        disableErrorFiltering : true;
}

Command.prototype = {
    sendWithObservableResult: function () {
        debug('Sent command ' + this.commandName, arguments);
        var args = new Array(arguments.length + 1);
        args[0] = this.commandName;
        for (var i = 0; i < arguments.length; i++) {
            args[i + 1] = arguments[i];
        }
        var src = Rx.Observable.fromCallback(this.socket.emit, this.socket).apply(null, args);
        if (this.disableErrorFiltering === true) {
            return src;
        }
        return src
            .do(this.logErrorFromResponse)
            .filter(this.isServerResponseSuccess);
    },

    logErrorFromResponse: function (reply) {
        debug('Server responded to ' + this.commandName, reply);
        if (!reply || !reply.success) {
            debug('Server error on ' + this.commandName, (reply || {}).error);
        }
    },

    isServerResponseSuccess: function (reply) {
        return reply && reply.success;
    }
};

module.exports = Command;

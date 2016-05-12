'use strict';

const Rx      = require('rxjs/Rx.KitchenSink');
const debug   = require('debug')('graphistry:StreamGL:graphVizApp:command');


function Command (description, commandName, socket, disableErrorFiltering = true) {
    this.description = description;
    this.commandName = commandName;
    this.socket = socket;
    this.disableErrorFiltering = disableErrorFiltering;
}

Command.prototype = {
    sendWithObservableResult: function (...args) {
        debug('Sent command ' + this.commandName, args);
        const src = Rx.Observable.bindCallback(this.socket.emit.bind(this.socket))(this.commandName, ...args);
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

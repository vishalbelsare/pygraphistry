'use strict';

var _       = require('underscore');
var Rx      = require('rx');
require('../rx-jquery-stub');

var util    = require('./util.js');


module.exports = {
    init: function (appState, socket, urlParams, $button /*, $filteringItems */) {
        if (!urlParams.debug) {
            $button.css({display: 'none'});
            return;
        }

        Rx.Observable.fromCallback(socket.emit, socket)('inspect_header', null)
            .do(function (reply) {
                if (!reply || !reply.success) {
                    console.error('Server error on inspectHeader', (reply||{}).error);
                }
            }).filter(function (reply) { return reply && reply.success; })
            .map(function (metadata) {

            }).subscribe(_.identity, util.makeErrorHandler('fetch inspectHeader'));
    },

    filterRangeParameters: function (type, attribute, start, stop) {
        return {
            type: type,
            attribute: attribute,
            start: start,
            stop: stop
        };
    },

    filterObservable: function (socket, params) {
        return Rx.Observable.fromCallback(socket.emit, socket)('filter', params)
            .map(function (reply) {
                console.log('Filter Request replied with: ', reply);
            }).subscribe(_.identity);
    }
};

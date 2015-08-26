'use strict';

var _       = require('underscore');
var Rx      = require('rx');
require('../rx-jquery-stub');


module.exports = {
    init: function (appState, socket, urlParams, $button /*, $filteringItems */) {

        if (urlParams.debug !== 'true') {
            $button.css({display: 'none'});
        }

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

'use strict';

var _       = require('underscore');
var Rx      = require('rx');
require('../rx-jquery-stub');

var util    = require('./util.js');


var namespaceMetadataSubject = new Rx.ReplaySubject(1);


function filterParametersCore(type, attribute) {
    return {
        type: type,
        attribute: attribute
    };
}

module.exports = {
    init: function (appState, socket, urlParams, $button /*, $filteringItems */) {
        if (!urlParams.debug) {
            $button.css({display: 'none'});
            return;
        }

        Rx.Observable.fromCallback(socket.emit, socket)('get_namespace_metadata', null)
            .do(function (reply) {
                if (!reply || !reply.success) {
                    console.error('Server error on inspectHeader', (reply||{}).error);
                }
            }).filter(function (reply) { return reply && reply.success; })
            .map(function (/*metadata*/) {

            }).subscribe(namespaceMetadataSubject, util.makeErrorHandler('fetch get_namespace_metadata'));
    },

    namespaceMetadataObservable: function () {
        return namespaceMetadataSubject;
    },

    filterRangeParameters: function (type, attribute, start, stop) {
        return _.extend(filterParametersCore(type, attribute), {
            start: start,
            stop: stop
        });
    },

    filterExactValueParameters: function (type, attribute, value) {
        return _.extend(filterParametersCore(type, attribute), {
            equals: value
        });
    },

    filterExactValuesParameters: function (type, attribute, values) {
        return _.extend(filterParametersCore(type, attribute), {
            equals: values
        });
    },

    filterObservable: function (socket, params) {
        return Rx.Observable.fromCallback(socket.emit, socket)('filter', params)
            .map(function (reply) {
                console.log('Filter Request replied with: ', reply);
            }).subscribe(_.identity);
    }
};

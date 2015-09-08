'use strict';

var _       = require('underscore');
var Rx      = require('rx');
require('../rx-jquery-stub');

var util    = require('./util.js');


function filterParametersCore(type, attribute) {
    return {
        type: type,
        attribute: attribute
    };
}


function FilterControl(socket) {
    this.namespaceMetadataSubject = new Rx.ReplaySubject(1);

    this.namespaceSubscription = Rx.Observable.fromCallback(socket.emit, socket)('get_namespace_metadata', null)
        .do(function (reply) {
            if (!reply || !reply.success) {
                console.error('Server error on get_namespace_metadata', (reply||{}).error);
            }
        }).filter(function (reply) {
            return reply && reply.success;
        }).do(function (reply) {
            this.namespaceMetadataSubject.onNext(reply.metadata);
        }.bind(this)).subscribe(function (data) { console.log(data); }, util.makeErrorHandler('fetch get_namespace_metadata'));
}


FilterControl.prototype.namespaceMetadataObservable = function () {
    return this.namespaceMetadataSubject;
};

FilterControl.prototype.filterRangeParameters = function (type, attribute, start, stop) {
    return _.extend(filterParametersCore(type, attribute), {
        start: start,
        stop: stop
    });
};

FilterControl.prototype.filterExactValueParameters = function (type, attribute, value) {
    return _.extend(filterParametersCore(type, attribute), {
        equals: value
    });
};

FilterControl.prototype.filterExactValuesParameters = function (type, attribute, values) {
    return _.extend(filterParametersCore(type, attribute), {
        equals: values
    });
};

FilterControl.prototype.filterObservable = function (socket, params) {
    return Rx.Observable.fromCallback(socket.emit, socket)('filter', params)
        .map(function (reply) {
            console.log('Filter Request replied with: ', reply);
        }).subscribe(_.identity);
};

FilterControl.prototype.dispose = function () {
    this.namespaceMetadataSubject.dispose();
    this.namespaceSubscription = this.namespaceMetadataSubject = undefined;
};

module.exports = FilterControl;

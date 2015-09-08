'use strict';

var _       = require('underscore');
var Rx      = require('rx');
require('../rx-jquery-stub');

var util    = require('./util.js');
var Command = require('./command.js');


function filterParametersCore(type, attribute) {
    return {
        type: type,
        attribute: attribute
    };
}


function FilterControl(socket) {
    this.namespaceMetadataSubject = new Rx.ReplaySubject(1);

    this.namespaceCommand = new Command('get_namespace_metadata', socket);
    this.updateFiltersCommand = new Command('update_filters', socket);
    // this.getFiltersCommand = new Command('get_filters', socket);
    this.namespaceSubscription = this.namespaceCommand.sendWithObservableResult(null)
        .do(function (reply) {
            this.namespaceMetadataSubject.onNext(reply.metadata);
        }.bind(this)).subscribe(function (data) { console.log(data); }, util.makeErrorHandler('fetch get_namespace_metadata'));

    /** @type Rx.ReplaySubject */
    this.filtersSubject = Rx.ReplaySubject(1);
}


FilterControl.prototype.namespaceMetadataObservable = function () {
    return this.namespaceMetadataSubject;
};

FilterControl.prototype.filtersObservable = function () {
    return this.filtersSubject;
};

FilterControl.prototype.updateFilters = function (filterSet) {
    this.updateFiltersCommand.sendWithObservableResult(filterSet)
        .do(function (reply) {
            this.filtersSubject.onNext(reply.filters);
        }.bind(this)).subscribe(
            function (data) { console.log(data); },
            util.makeErrorHandler('handle update_filters response'));
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
    this.namespaceSubscription.dispose();
    this.namespaceMetadataSubject.dispose();
    this.namespaceSubscription = this.namespaceMetadataSubject = undefined;
};

module.exports = FilterControl;

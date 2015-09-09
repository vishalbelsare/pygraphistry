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
    this.runFilterCommand = new Command('filter', socket);

    /** @type Rx.ReplaySubject */
    this.filtersResponsesSubject = new Rx.ReplaySubject(1);
}


FilterControl.prototype.namespaceMetadataObservable = function () {
    if (this.namespaceSubscription === undefined) {
        this.namespaceSubscription = this.namespaceCommand.sendWithObservableResult(null)
            .do(function (reply) {
                this.namespaceMetadataSubject.onNext(reply.metadata);
            }.bind(this)).subscribe(_.identity, util.makeErrorHandler('fetch get_namespace_metadata'));
    }
    return this.namespaceMetadataSubject;
};

FilterControl.prototype.filtersResponsesObservable = function () {
    return this.filtersResponsesSubject;
};

FilterControl.prototype.updateFilters = function (filterSet) {
    this.updateFiltersCommand.sendWithObservableResult(filterSet, true)
        .do(function (reply) {
            this.filtersResponsesSubject.onNext(reply);
        }.bind(this)).subscribe(
        _.identity,
        util.makeErrorHandler('handle update_filters response'));
    return this.filtersResponsesSubject;
};

FilterControl.prototype.clearFilters = function () { return this.updateFilters([]); };

FilterControl.prototype.queryToExpression = function(query) {
    if (!query) { return undefined; }
    var attribute = query.attribute;
    if (!attribute) {
        attribute = '<unknown>';
    }
    // Basic namespace-indication:
    if (query.type) {
        attribute = query.type + ':' + attribute;
    }
    // Should quote inner brackets if we commit to this:
    // attribute = '[' + attribute + ']';
    if (query.hasOwnProperty('start') && query.hasOwnProperty('stop')) {
        return attribute + ' BETWEEN ' + query.start.toString(10) +
            ' AND ' + query.stop.toString(10);
    } else if (query.hasOwnProperty('start')) {
        return attribute + ' >= ' + query.start.toString(10);
    } else if (query.hasOwnProperty('stop')) {
        return query.stop.toString(10) + ' <= ' + attribute;
    } else if (query.hasOwnProperty('equals')) {
        if (Array.isArray(query.equals)) {
            return attribute + ' IN ' + query.equals.toString();
        } else {
            return attribute + ' = ' + query.equals.toString();
        }
    }
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

FilterControl.prototype.filterObservable = function (params) {
    return this.runFilterCommand.sendWithObservableResult(params, true)
        .do(function (reply) {
            this.filtersResponsesSubject.onNext(reply);
        }).subscribe(_.identity);
};

FilterControl.prototype.dispose = function () {
    if (this.namespaceSubscription !== undefined) {
        this.namespaceSubscription.dispose();
        this.namespaceSubscription = undefined;
    }
    this.namespaceMetadataSubject.dispose();
    this.namespaceMetadataSubject = undefined;
    this.filtersResponsesSubject.dispose();
    this.filtersResponsesSubject = undefined;
};

module.exports = FilterControl;

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

FilterControl.prototype.print = function (value) {
    if (typeof value === 'string') {
        return JSON.stringify(value);
    } else if (typeof value === 'number') {
        return value.toString(10);
    } else if (typeof value === 'undefined') {
        return 'NULL';
    } else if (Array.isArray(value)) {
        return '(' + _.map(value, function (each) {
                return this.print(each);
            }, this).join(', ') + ')';
    } else {
        return '<unknown>';
    }
};

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
    if (query.start !== undefined && query.stop !== undefined) {
        return attribute + ' BETWEEN ' + this.print(query.start) +
            ' AND ' + this.print(query.stop);
    } else if (query.start !== undefined) {
        return attribute + ' >= ' + this.print(query.start);
    } else if (query.stop !== undefined) {
        return this.print(query.stop) + ' <= ' + attribute;
    } else if (query.equals !== undefined) {
        if (Array.isArray(query.equals) && query.equals.length > 1) {
            return attribute + ' IN ' + this.print(query.equals);
        } else {
            return attribute + ' = ' + query.equals.toString();
        }
    }
};

FilterControl.prototype.queryFromExpressionTokens = function (expressionTokens) {
    if (!expressionTokens) { return undefined; }
    var query = {};
    return query;
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

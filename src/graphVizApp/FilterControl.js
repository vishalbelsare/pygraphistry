'use strict';

const _     = require('underscore');
const Rx    = require('rxjs/Rx.KitchenSink');
require('../rx-jquery-stub');
const PEGUtil = require('pegjs-util');
// const ASTY    = require('asty');

const util    = require('./util.js');
const Command = require('./command.js');
const parser  = require('./expression.pegjs');


function queryParametersCore (type, attribute) {
    return {
        type: type,
        attribute: attribute
    };
}


function FilterControl (socket) {
    this.namespaceMetadataSubject = new Rx.ReplaySubject(1);

    this.namespaceCommand = new Command('getting column descriptions', 'get_namespace_metadata', socket, false);
    this.getFiltersCommand = new Command('getting filters', 'get_filters', socket);
    this.updateFiltersCommand = new Command('updating filters', 'update_filters', socket);
    this.updateFiltersRequests = new Rx.Subject();
    this.runFilterCommand = new Command('filtering the view', 'filter', socket);

    this.encodeCommand = new Command('Encode a column', 'encode_by_column', socket);

    this.describeCommand = new Command('Describe a column', 'describe_column', socket);

    this.highlightCommand = new Command('Highlight elements', 'highlight', socket);

    /** @type Rx.ReplaySubject */
    this.filtersResponsesSubject = new Rx.ReplaySubject(1);
    this.exclusionsResponsesSubject = new Rx.ReplaySubject(1);
    /** @type Rx.ReplaySubject */
    this.setsResponsesSubject = new Rx.ReplaySubject(1);
    // Get initial filters values:
    this.getFiltersCommand.sendWithObservableResult()
        .do((reply) => {
            this.filtersResponsesSubject.onNext(reply.filters);
            this.exclusionsResponsesSubject.onNext(reply.exclusions);
            if (reply.sets !== undefined) {
                this.setsResponsesSubject.onNext(reply.sets);
            }
        }).subscribe(_.identity, util.makeErrorHandler(this.getFiltersCommand.description));

    util.bufferUntilReady(this.updateFiltersRequests).do((hash) => {
        this.updateFiltersCommand.sendWithObservableResult(hash.data)
            .do((reply) => {
                this.filtersResponsesSubject.onNext(reply);
                if (reply.sets !== undefined) {
                    this.setsResponsesSubject.onNext(reply.sets);
                }
                hash.ready();
            }).subscribe(_.identity, util.makeErrorHandler(this.updateFiltersCommand.description));
    }).subscribe(_.identity, util.makeErrorHandler(this.updateFiltersCommand.description));
}

FilterControl.prototype.namespaceMetadataObservable = function () {
    if (this.namespaceSubscription === undefined) {
        this.namespaceSubscription = this.namespaceCommand.sendWithObservableResult()
            .do((reply) => {
                this.namespaceMetadataSubject.onNext(reply.metadata);
            }).subscribe(_.identity, util.makeErrorHandler(this.namespaceCommand.description));
    }
    return this.namespaceMetadataSubject;
};

FilterControl.prototype.updateExclusions = function (exclusions) {
    this.updateFiltersRequests.onNext({exclusions: exclusions});
    return this.filtersResponsesSubject;
};

FilterControl.prototype.updateFilters = function (filterStack) {
    this.updateFiltersRequests.onNext({filters: filterStack});
    return this.filtersResponsesSubject;
};

FilterControl.prototype.clearExclusions = function () { return this.updateExclusions([]); };

FilterControl.prototype.clearFilters = function () { return this.updateFilters([]); };

FilterControl.prototype.queryFromExpressionString = function (inputString) {
    // const asty = new ASTY();
    const result = PEGUtil.parse(parser, inputString, {
        startRule: 'start'/*,
        makeAST: function (line, column, offset, args) {
            return asty.create.apply(asty, args).pos(line, column, offset);
        }*/
    });
    // TODO set result.attribute by walking the AST for Identifiers, requires asty.
    result.inputString = inputString;
    return result;
};

FilterControl.prototype.queryRangeParameters = function (type, attribute, start, stop) {
    return _.extend(queryParametersCore(type, attribute), {
        ast: {
            type: 'BetweenPredicate',
            value: {type: 'Identifier', name: attribute},
            start: {type: 'Literal', value: start},
            stop: {type: 'Literal', value: stop}
        }
    });
};

FilterControl.prototype.queryExactValueParameters = function (type, attribute, value) {
    return _.extend(queryParametersCore(type, attribute), {
        ast: {
            type: 'BinaryPredicate',
            operator: '=',
            left: {type: 'Identifier', name: attribute},
            right: {type: 'Literal', value: value}
        }
    });
};

FilterControl.prototype.queryExactValuesParameters = function (type, attribute, values) {
    return _.extend(queryParametersCore(type, attribute), {
        ast: {
            type: 'BinaryPredicate',
            operator: 'IN',
            left: {type: 'Identifier', name: attribute},
            right: {type: 'ListExpression', elements: _.map(values, (value) => ({type: 'Literal', value: value}))}
        }
    });
};

FilterControl.prototype.filterObservable = function (params) {
    return this.runFilterCommand.sendWithObservableResult(params)
        .do((reply) => {
            this.filtersResponsesSubject.onNext(reply.filters);
            if (reply.sets !== undefined) {
                this.setsResponsesSubject.onNext(reply.sets);
            }
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

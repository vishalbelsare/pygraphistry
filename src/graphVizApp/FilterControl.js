'use strict';

var _       = require('underscore');
var Rx      = require('rx');
require('../rx-jquery-stub');
var PEGUtil = require('pegjs-util');
//var ASTY    = require('asty');

var util    = require('./util.js');
var Command = require('./command.js');
var parser  = require('./expressionParser.js');


function filterParametersCore(type, attribute) {
    return {
        type: type,
        attribute: attribute
    };
}


function FilterControl(socket) {
    this.namespaceMetadataSubject = new Rx.ReplaySubject(1);

    this.namespaceCommand = new Command('getting column descriptions', 'get_namespace_metadata', socket, false);
    this.getFiltersCommand = new Command('getting filters', 'get_filters', socket);
    this.updateFiltersCommand = new Command('updating filters', 'update_filters', socket);
    this.updateFiltersRequests = new Rx.Subject();
    this.runFilterCommand = new Command('filtering the view', 'filter', socket);

    this.encodeCommand = new Command('Encode a column', 'encode_by_column', socket);

    /** @type Rx.ReplaySubject */
    this.filtersResponsesSubject = new Rx.ReplaySubject(1);
    this.exclusionsResponsesSubject = new Rx.ReplaySubject(1);
    /** @type Rx.ReplaySubject */
    this.setsResponsesSubject = new Rx.ReplaySubject(1);
    // Get initial filters values:
    this.getFiltersCommand.sendWithObservableResult()
        .do(function (reply) {
            this.filtersResponsesSubject.onNext(reply.filters);
            this.exclusionsResponsesSubject.onNext(reply.exclusions);
            if (reply.sets !== undefined) {
                this.setsResponsesSubject.onNext(reply.sets);
            }
        }.bind(this)).subscribe(_.identity, util.makeErrorHandler(this.getFiltersCommand.description));

    util.bufferUntilReady(this.updateFiltersRequests).do(function (hash) {
        this.updateFiltersCommand.sendWithObservableResult(hash.data)
            .do(function (reply) {
                this.filtersResponsesSubject.onNext(reply);
                if (reply.sets !== undefined) {
                    this.setsResponsesSubject.onNext(reply.sets);
                }
                hash.ready();
            }.bind(this)).subscribe(_.identity, util.makeErrorHandler(this.updateFiltersCommand.description));
    }.bind(this)).subscribe(_.identity, util.makeErrorHandler(this.updateFiltersCommand.description));
}

FilterControl.prototype.namespaceMetadataObservable = function () {
    if (this.namespaceSubscription === undefined) {
        this.namespaceSubscription = this.namespaceCommand.sendWithObservableResult()
            .do(function (reply) {
                this.namespaceMetadataSubject.onNext(reply.metadata);
            }.bind(this)).subscribe(_.identity, util.makeErrorHandler(this.namespaceCommand.description));
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

FilterControl.prototype.printedExpressionOf = function (value) {
    if (typeof value === 'string') {
        return JSON.stringify(value);
    } else if (typeof value === 'number') {
        return value.toString(10);
    } else if (typeof value === 'undefined' || value === null) {
        return 'NULL';
    } else if (Array.isArray(value)) {
        return '(' + _.map(value, function (each) {
                return this.printedExpressionOf(each);
            }, this).join(', ') + ')';
    } else {
        return '<unknown>';
    }
};

/**
 * @param {String} attributeName
 * @returns {String}
 */
FilterControl.prototype.identifierToExpression = function (attributeName) {
    if (attributeName.match(/[^A-Za-z0-9:_]/)) {
        return '[' + attributeName.replace(']', '\\]') + ']';
    } else {
        return attributeName;
    }
};

FilterControl.prototype.queryToExpression = function(query) {
    if (!query) { return undefined; }
    if (query.inputString) {
        return query.inputString;
    }
    var attribute = query.attribute;
    if (!attribute) {
        attribute = '<unknown>';
    }
    // Basic namespace-indication:
    if (query.type) {
        attribute = query.type + ':' + attribute;
    }
    var printedAttribute = this.identifierToExpression(attribute);
    // Should quote inner brackets if we commit to this:
    // attribute = '[' + attribute + ']';
    if (query.start !== undefined && query.stop !== undefined) {
        return printedAttribute + ' BETWEEN ' + this.printedExpressionOf(query.start) +
            ' AND ' + this.printedExpressionOf(query.stop);
    } else if (query.start !== undefined) {
        return printedAttribute + ' >= ' + this.printedExpressionOf(query.start);
    } else if (query.stop !== undefined) {
        return this.printedExpressionOf(query.stop) + ' <= ' + printedAttribute;
    } else if (query.equals !== undefined) {
        if (Array.isArray(query.equals) && query.equals.length > 1) {
            return printedAttribute + ' IN ' + this.printedExpressionOf(query.equals);
        } else {
            return printedAttribute + ' = ' + this.printedExpressionOf(query.equals);
        }
    }
};

FilterControl.prototype.queryFromExpressionString = function (inputString) {
    //var asty = new ASTY();
    var result = PEGUtil.parse(parser, inputString, {
        startRule: 'start'/*,
        makeAST: function (line, column, offset, args) {
            return asty.create.apply(asty, args).pos(line, column, offset);
        }*/
    });
    // TODO set result.attribute by walking the AST for Identifiers, requires asty.
    result.inputString = inputString;
    return result;
};

FilterControl.prototype.queryFromAST = function (ast) {
    switch (ast.type) {
        case 'BinaryExpression':
            // Special-case for BETWEEN/AND expansion:
            if (ast.operator.toUpperCase() === 'AND') {
                if (ast.left.operator === '>=' && ast.right.operator === '<=' &&
                    ast.left.left.type === 'Identifier' &&
                    _.isEqual(ast.left.left, ast.right.left)) {
                    return {
                        attribute: ast.left.left.value,
                        start: ast.left.right.value,
                        stop: ast.right.right.value
                    };
                }
            }
            break;
        default:
            break;
    }
};

/**
 * @typedef {{type: String, value: String}} Token
 */

/**
 *
 * @param {Token[]} tokens
 * @returns {Object}
 */
FilterControl.prototype.queryFromExpressionTokens = function (tokens) {
    if (!tokens) { return undefined; }
    var query = {};
    if (tokens[0].type === 'identifier') {
        query.attribute = tokens[0].value;
        var idx = query.attribute.indexOf(':');
        if (idx > 1) {
            query.type = query.attribute.slice(0, idx - 1);
        }
    }
    if (tokens[1].type === 'operator') {
        var op = tokens[1].value;
        if (op === '=' || op === '==') {
            query.equals = tokens[2].value;
        } else {
            console.warn('Unhandled operator', tokens[1].value);
        }
    } else if (tokens[1].type === 'keyword') {
        var keyword = tokens[1].value.toLowerCase();
        if (keyword === 'between') {
            var startValue = tokens[2].value;
            if (tokens[3].value.toLowerCase() === 'and') {
                var stopValue = tokens[4].value;
                query.start = startValue;
                query.stop = stopValue;
            }
        }
    }
    return query;
};

FilterControl.prototype.filterRangeParameters = function (type, attribute, start, stop) {
    var result = _.extend(filterParametersCore(type, attribute), {
        start: start,
        stop: stop
    });
    result.inputString = this.queryToExpression(result);
    return result;
};

FilterControl.prototype.filterExactValueParameters = function (type, attribute, value) {
    var result = _.extend(filterParametersCore(type, attribute), {
        equals: value
    });
    result.inputString = this.queryToExpression(result);
    return result;
};

FilterControl.prototype.filterExactValuesParameters = function (type, attribute, values) {
    var result = _.extend(filterParametersCore(type, attribute), {
        equals: values
    });
    result.inputString = this.queryToExpression(result);
    return result;
};

FilterControl.prototype.filterObservable = function (params) {
    return this.runFilterCommand.sendWithObservableResult(params)
        .do(function (reply) {
            this.filtersResponsesSubject.onNext(reply.filters);
            if (reply.sets !== undefined) {
                this.setsResponsesSubject.onNext(reply.sets);
            }
        }.bind(this)).subscribe(_.identity);
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

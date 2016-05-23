'use strict';

const _ = require('underscore');

function ExpressionPrinter () {
}

ExpressionPrinter.equals = function (left, right) {
    return {type: 'EqualityPredicate', operator: '=', left, right};
};

ExpressionPrinter.not = function (value) {
    return {type: 'NotExpression', operator: 'NOT', value};
};

ExpressionPrinter.and = function (...args) {
    return _.reduce(args, (left, right) => ({type: 'BinaryPredicate', operator: 'AND', left, right}));
};

ExpressionPrinter.or = function (...args) {
    return _.reduce(args, (left, right) => ({type: 'BinaryPredicate', operator: 'OR', left, right}));
};

ExpressionPrinter.list = function (...args) {
    return {type: 'ListExpression', elements: args};
};

ExpressionPrinter.betweenAnd = function (value, start, stop) {
    return {type: 'BetweenPredicate', start, stop, value};
};

ExpressionPrinter.identifier = function (name) {
    return {type: 'Identifier', name};
};

ExpressionPrinter.literal = function (value, dataType) {
    return {type: 'Literal', value, dataType};
};

/**
 * @param value
 * @param {String} dataType
 * @returns {String}
 */
ExpressionPrinter.printedExpressionOf = function (value, dataType = typeof value) {
    if (dataType === 'string') {
        return JSON.stringify(value);
    } else if (dataType === 'number') {
        if (typeof value === 'string') { // it was serialized to avoid JSON limitations
            return value;
        } else {
            return value.toString(10);
        }
    } else if (dataType === 'boolean') {
        return value.toString().toUpperCase();
    } else if (value === undefined || value === null) {
        return 'NULL';
    } else if (Array.isArray(value)) {
        return '(' + _.map(value, (each) => this.printedExpressionOf(each)).join(', ') + ')';
    } else {
        return JSON.stringify(value);
    }
};

/**
 * @param {ClientQueryAST} ast
 * @returns {String}
 */
ExpressionPrinter.printAST = function (ast) {
    if (ast === undefined) { return ''; }
    let properties, elements;
    switch (ast.type) {
        case 'BetweenPredicate':
            properties = _.mapObject(_.pick(ast, ['start', 'stop', 'value']), (propAST) => this.printAST(propAST));
            return [properties.value, 'BETWEEN', properties.start, 'AND', properties.stop].join(' ');
        case 'RegexPredicate':
        case 'LikePredicate':
        case 'BinaryPredicate':
        case 'BinaryExpression':
            properties = _.mapObject(_.pick(ast, ['left', 'right']), (propAST) => this.printAST(propAST));
            return [properties.left, ast.operator, properties.right].join(' ');
        case 'UnaryExpression':
            properties = _.mapObject(_.pick(ast, ['argument']), (propAST) => this.printAST(propAST));
            if (ast.fixity === 'postfix') {
                return properties.argument + ' ' + ast.operator;
            } else { // if (ast.fixity === 'prefix') {
                return ast.operator + ' ' + properties.argument;
            }
        case 'CaseBranch':
            properties = _.mapObject(_.pick(ast, ['condition', 'result']), (propAST) => this.printAST(propAST));
            return [properties.condition, 'THEN', properties.result].join(' ');
        case 'CaseExpression':
            properties = _.mapObject(_.pick(ast, ['value', 'elseClause']), (propAST) => this.printAST(propAST));
            elements = _.map(ast.cases, (caseAST) => 'WHEN ' + this.printAST(caseAST));
            return (['CASE', properties.value]
                .concat(elements)
                .concat(ast.elseClause ? ['ELSE', properties.elseClause, 'END'] : ['END'])).join(' ');
        case 'ConditionalExpression':
            properties = _.mapObject(_.pick(ast, ['elseClause']), (propAST) => this.printAST(propAST));
            elements = _.map(ast.cases, (caseAST) => 'IF ' + this.printAST(caseAST));
            return elements.join(' ELSE ') +
                (ast.elseClause ? [' ELSE', properties.elseClause, 'END'] : [' END']).join(' ');
        case 'MemberAccess':
            properties = _.mapObject(_.pick(ast, ['object', 'property']), (propAST) => this.printAST(propAST));
            return [properties.object, '[', properties.property, ']'].join('');
        case 'CastExpression':
            properties = _.mapObject(_.pick(ast, ['value']), (propAST) => this.printAST(propAST));
            return ['CAST', properties.value, 'AS', ast.type_name].join(' ');
        case 'NotExpression':
            properties = _.mapObject(_.pick(ast, ['value']), (propAST) => this.printAST(propAST));
            return ast.operator + ' ' + properties.value;
        case 'ListExpression':
            elements = _.map(ast.elements, (propAST) => this.printAST(propAST));
            return '(' + elements.join(', ') + ')';
        case 'FunctionCall':
            elements = _.map(ast.arguments, (propAST) => this.printAST(propAST));
            return ast.callee.name + '(' + elements.join(', ') + ')';
        case 'Literal':
            return this.printedExpressionOf(ast.value, ast.dataType);
        case 'Identifier':
            return ast.name;
        case 'LimitExpression':
            return 'LIMIT ' + this.printAST(ast.value);
        default:
            throw new Error('Unhandled type: ' + ast.type);
    }
};

ExpressionPrinter.print = function (query) {
    if (query === undefined) {
        return undefined;
    } else if (query.inputString) {
        return query.inputString;
    } else if (query.ast) {
        return this.printAST(query.ast);
    } else {
        return undefined;
    }
};


module.exports = ExpressionPrinter;

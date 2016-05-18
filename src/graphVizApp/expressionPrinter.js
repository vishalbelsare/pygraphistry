'use strict';

const _ = require('underscore');
const Identifier = require('./Identifier.js');

function ExpressionPrinter () {
}

ExpressionPrinter.printedExpressionOf = function (value) {
    if (typeof value === 'string') {
        return JSON.stringify(value);
    } else if (typeof value === 'number') {
        return value.toString(10);
    } else if (typeof value === 'undefined' || value === null) {
        return 'NULL';
    } else if (Array.isArray(value)) {
        return '(' + _.map(value, (each) => this.printedExpressionOf(each)).join(', ') + ')';
    } else {
        return '<unknown>';
    }
};

ExpressionPrinter.printAST = function (ast) {
    if (typeof ast === 'Array') {
        return _.map(ast, (eachAST) => this.printAST(eachAST));
    }
    let properties;
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
        // case 'CaseExpression':
        //     properties = _.mapObject(_.pick(ast, ['value', 'cases', 'elseClause']), (propAST) => this.printAST(propAST));
        // case 'ConditionalExpression':
        //     properties = _.mapObject(_.pick(ast, ['cases', 'elseClause']), (propAST) => this.printAST(propAST));
        // case 'CaseBranch':
        //     properties = _.mapObject(_.pick(ast, ['condition', 'result']), (propAST) => this.printAST(propAST));
        // case 'MemberAccess':
        //     properties = _.mapObject(_.pick(ast, ['object', 'property']), (propAST) => this.printAST(propAST));
        case 'CastExpression':
            properties = _.mapObject(_.pick(ast, ['value']), (propAST) => this.printAST(propAST));
            return ['CAST', properties.value, 'AS', ast.type_name].join(' ');
        case 'NotExpression':
            properties = _.mapObject(_.pick(ast, ['value']), (propAST) => this.printAST(propAST));
            return [ast.operator, properties.value].join(' ');
        case 'ListExpression':
            properties = _.mapObject(_.pick(ast, ['elements']), (propAST) => this.printAST(propAST));
            return '(' + properties.elements.join(', ') + ')';
        // case 'FunctionCall':
        //     properties = _.mapObject(_.pick(ast, ['arguments']), (propAST) => this.printAST(propAST));
        case 'Literal':
            return JSON.stringify(ast.value);
        case 'Identifier':
            return ast.name;
        default:
            throw new Error('Unrecognized type: ' + ast.type);
    }
};

ExpressionPrinter.print = function (query) {
    if (!query) { return undefined; }
    if (query.inputString) {
        return query.inputString;
    }
    if (query.ast) {
        return this.printAST(query.ast);
    }
    let attribute = query.attribute;
    if (!attribute) {
        attribute = '<unknown>';
    }
    attribute = Identifier.clarifyWithPrefixSegment(attribute, query.type);
    const printedAttribute = Identifier.identifierToExpression(attribute);
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


module.exports = ExpressionPrinter;

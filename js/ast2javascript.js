'use strict';

var _ = require('underscore');



function AST2JavaScript() {
    this.outputLanguage = 'JavaScript';
}

/**
 * Ref. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
 * @param {String} operatorName
 * @param {String} [fixity] - prefix, suffix, infix
 * @returns {Number}
 */
AST2JavaScript.prototype.precedenceOf = function (operatorName, fixity) {
    switch (operatorName) {
        case '.':
            return 18;
        case '+':
        case '-':
            if (fixity === 'prefix') {
                return 15;
            }
            return 13;
        case '++':
        case '--':
            if (fixity === 'prefix') {
                return 15;
            }
            return 16;
        case '!':
        case '~':
            return 15;
        case '*':
        case '/':
        case '%':
        case '**':
            return 14;
        case '<<':
        case '>>':
        case '>>>':
            return 12;
        case '<':
        case '<=':
        case '>':
        case '>=':
        case 'in':
        case 'instanceof':
            return 11;
        case '==':
        case '!=':
        case '===':
        case '!==':
            return 10;
        case '&':
            return 9;
        case '^':
            return 8;
        case '|':
            return 7;
        case '&&':
            return 6;
        case '||':
            return 5;
        case '?:':
            return 4;
        case 'yield':
            return 2;
        case '...':
            return 1;
        case ',':
            return 0;
        default:
            // Any assignment:
            if (operatorName.endsWith('=')) {
                return 3;
            }
            return Infinity;
    }
};

/**
 * Insert parentheses to disambiguate expression composition in the text.
 */
AST2JavaScript.prototype.wrapSubExpressionPerPrecedences = function (subExprString, precedence, outerPrecedence) {
    if (subExprString === undefined || subExprString.length === 0) {
        return subExprString;
    }
    // Could be < but we're conservative about associativity for now.
    if (precedence <= outerPrecedence) {
        return '(' + subExprString + ')';
    }
    return subExprString;
};

/**
 * @param {String} operatorString
 * @returns {String}
 */
AST2JavaScript.prototype.translateOperator = function (operatorString) {
    switch (operatorString.toLowerCase()) {
        case 'and':
            return '&&';
        case 'or':
            return '||';
        case 'not':
            return '!';
        case 'is':
            return '===';
        default:
            return operatorString;
    }
};


AST2JavaScript.prototype.expressionForFunctionCall = function (inputFunctionName, args, outerPrecedence) {
    var safeFunctionName;
    var funcallPrecedence = this.precedenceOf('.');
    var methodCall = function (firstArg, outputFunctionName, restArgs) {
        return this.wrapSubExpressionPerPrecedences(
            firstArg + '.' + outputFunctionName + '(' + restArgs ? restArgs.join(', ') : '' + ')',
            funcallPrecedence, outerPrecedence);
    }.bind(this);
    switch (inputFunctionName.toUpperCase()) {
        case 'DATE':
            safeFunctionName = 'new Date';
            break;
        case 'CONCATENATE':
        case 'CONCAT':
            return this.wrapSubExpressionPerPrecedences(
                args.join(' + '), this.precedenceOf('+'), outerPrecedence);
        case 'LOWER':
            return methodCall(args[0], 'toLowerCase');
        case 'UPPER':
            return methodCall(args[0], 'toUpperCase');
        case 'LEN':
        case 'LENGTH':
            return this.wrapSubExpressionPerPrecedences(
                args[0] + '.length', funcallPrecedence, outerPrecedence);
        case 'INT':
            return methodCall('Number', 'parseInt', args);
        case 'NUMBER':
            return 'Number(' + args[0] + ')';
        case 'FIRST':
        case 'LEFT':
            return methodCall(args[0], 'slice', [0, args[1]]);
        case 'LAST':
        case 'RIGHT':
            return methodCall(args[0], 'slice', ['-' + args[1]]);
        case 'MID':
            return methodCall(args[0], 'slice', [args[1], args[1] + args[2]]);
        case 'ISBLANK':
        case 'ISEMPTY':
            return this.wrapSubExpressionPerPrecedences(
                args[0] + ' === undefined || ' + args[0] + '.length === 0',
                this.precedenceOf('||'), outerPrecedence);
        case 'STARTSWITH':
            return methodCall(args[0], 'startsWith', [args[1]]);
        case 'ENDSWITH':
            return methodCall(args[0], 'endsWith', [args[1]]);
        case 'FIND':
            return methodCall(args[0], 'indexOf', [args[1]]);
        case 'CONTAINS':
            return this.wrapSubExpressionPerPrecedences(
                args[0] + '.indexOf(' + args[1] + ') !== -1',
                this.precedenceOf('!=='), outerPrecedence);
        case 'REPLACE':
            return methodCall(args[0], 'replace', args.slice(-(args.length - 1)));
        case 'SPLIT':
            return methodCall(args[0], 'split', args.slice(-(args.length - 1)));
        case 'TRIM':
            return methodCall(args[0], 'trim');
        case 'LTRIM':
            return methodCall(args[0], 'trimLeft');
        case 'RTRIM':
            return methodCall(args[0], 'trimRight');
        case 'MAX':
            return methodCall('Math', 'max', args);
        case 'MIN':
            return methodCall('Math', 'min', args);
        default:
            throw new Error('Unrecognized function', inputFunctionName);
    }
    return safeFunctionName + '(' + args.join(', ') + ')';
};


/**
 * Printed source form of the expression in JavaScript that executes the AST.
 * @param {Object} ast - From expression parser.
 * @param {Number} [depth] - Specifies depth, to use for pretty-printing/indents.
 * @param {Number} [outerPrecedence] - Surrounding expression precedence, determines whether result needs ().
 * @returns {String}
 */
AST2JavaScript.prototype.singleValueFunctionForAST = function (ast, depth, outerPrecedence) {
    if (typeof ast === 'string') {
        return ast;
    }
    // This enables identifier-parsing.
    var handleMultipleColumns = false;
    if (depth === undefined) {
        depth = 0;
    }
    var subExprString, operator, precedence, args;
    switch (ast.type) {
        case 'LogicalExpression':
        case 'BinaryExpression':
            operator = this.translateOperator(ast.operator);
            precedence = this.precedenceOf(operator);
            args = _.map([ast.left, ast.right], function (arg) {
                return this.singleValueFunctionForAST(arg, depth + 1, precedence);
            }, this);
            subExprString = [args[0], operator, args[1]].join(' ');
            return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
        case 'UnaryExpression':
            operator = this.translateOperator(ast.operator);
            precedence = this.precedenceOf(operator, ast.fixity);
            var arg = this.singleValueFunctionForAST(ast.argument, depth + 1, precedence);
            switch (ast.fixity) {
                case 'prefix':
                    subExprString = operator + ' ' + arg;
                    break;
                case 'postfix':
                    subExprString = arg + ' ' + operator;
                    break;
            }
            return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
        case 'CastExpression':
            return ast.value;
        case 'ListExpression':
            args = _.map(ast.arguments, function (arg) {
                return this.singleValueFunctionForAST(arg, depth + 1, 19);
            }, this);
            return '[' + args.join(', ') + ']';
        case 'FunctionCall':
            args = _.map(ast.arguments, function (arg) {
                return this.singleValueFunctionForAST(arg, depth + 1, 19);
            }, this);
            return this.expressionForFunctionCall(this.singleValueFunctionForAST(ast.callee), args, outerPrecedence);
        case 'Identifier':
            if (handleMultipleColumns) {
                var unsafeInputName = ast.name;
                // Delete all non-word characters, but keep colons and dots.
                var unsafeInputNameWord = unsafeInputName.replace(/[^\W:.]/, '');
                var unsafeInputParts = unsafeInputNameWord.split(/:/);
                var scope;
                if (unsafeInputParts.length === 0) {
                    return 'undefined';
                }
                if (unsafeInputParts.length > 1) {
                    switch (unsafeInputParts[0]) {
                        case 'point':
                            scope = 'point';
                            break;
                        case 'edge':
                            scope = 'edge';
                            break;
                        default:
                            scope = undefined;
                            break;
                    }
                }
                return unsafeInputParts[unsafeInputParts.length - 1];
            }
            return 'value';
        default:
            throw new Error('Unrecognized type on AST node', ast);
    }
};

module.exports = AST2JavaScript;
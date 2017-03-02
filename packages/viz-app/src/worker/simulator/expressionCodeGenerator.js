'use strict';

const _ = require('underscore');

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz:expressionCodeGenerator');


function ExpressionCodeGenerator(language = 'JavaScript') {
    this.language = language;
}

function escapeRegexNonPattern (lastPatternSegment) {
    return lastPatternSegment.replace('.', '[.]');
}

//<editor-fold desc="Poly-Fills">

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (searchString, position) {
        position = position || 0;
        return this.indexOf(searchString, position) === position;
    };
}

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (searchString, position) {
        const subjectString = this.toString();
        if (position === undefined || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        const lastIndex = subjectString.lastIndexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    };
}

if (!Math.sign) {
    Math.sign = function (x) {
        x = +x; // convert to a number
        if (x === 0 || isNaN(x)) {
            return x;
        }
        return x > 0 ? 1 : -1;
    };
}

if (!Math.trunc) {
    Math.trunc = function (x) {
        return x < 0 ? Math.ceil(x) : Math.floor(x);
    };
}

//</editor-fold>

function literalExpressionFor (value, dataType) {
    if (dataType === 'number' && typeof value === 'string') {
        value = Number(value);
    }
    if (_.isNumber(value)) {
        return value.toString();
    }
    return JSON.stringify(value);
}

function propertyAccessExprStringFor (key) {
    return key.match(/\W/) ? 'this[' + literalExpressionFor(key) + ']' : 'this.' + key;
}

const InputPropertiesByShape = {
    BetweenPredicate: ['start', 'stop', 'value'],
    BinaryExpression: ['left', 'right'],
    CaseExpression: ['value', 'cases', 'elseClause'],
    ConditionalExpression: ['cases', 'elseClause'],
    CaseBranch: ['condition', 'result'],
    UnaryExpression: ['argument'],
    MemberAccess: ['object', 'property'],
    MemberOfExpression: ['value'],
    NotExpression: ['value'],
    ListExpression: ['elements'],
    FunctionCall: ['arguments']
};

ExpressionCodeGenerator.prototype = {
    /**
     * Ref. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
     * @param {String} operatorName
     * @param {String} [fixity] - prefix, suffix, infix
     * @returns {Number}
     */
    precedenceOf: function (operatorName, fixity) {
        switch (operatorName) {
            case '(':
            case ')':
                return 19;
            case '[':
            case ']':
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
    },

    /**
     * Insert parentheses to disambiguate expression composition in the text.
     */
    wrapSubExpressionPerPrecedences: function (subExprString, precedence, outerPrecedence) {
        if (subExprString === undefined || subExprString.length === 0) {
            return subExprString;
        }
        // Could be < but we're conservative about associativity for now.
        if (precedence <= outerPrecedence) {
            return '(' + subExprString + ')';
        }
        return subExprString;
    },

    /**
     * @param {String} operatorString
     * @returns {String}
     */
    translateOperator: function (operatorString) {
        switch (operatorString) {
            case 'AND':
                return '&&';
            case 'OR':
                return '||';
            case 'NOT':
                return '!';
            case '!=':
            case '<>':
                return '!==';
            case 'IS':
            case '=':
            case '==':
                return '===';
            default:
                return operatorString;
        }
    },

    expressionForFunctionCall: function (inputFunctionName, args, outerPrecedence) {
        let safeFunctionName;
        const precedence = this.precedenceOf('.');
        const methodCall = (firstArg, outputFunctionName, restArgs) => {
            return this.wrapSubExpressionPerPrecedences(
                firstArg + '.' + outputFunctionName + '(' + (restArgs !== undefined ? restArgs.join(', ') : '') + ')',
                precedence, outerPrecedence);
        };
        switch (inputFunctionName.toUpperCase()) {
            case 'DATE':
            case 'TIME':
            case 'TIMESTAMP':
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
                    args[0] + '.length', precedence, outerPrecedence);
            case 'INT':
                return methodCall('Number', 'parseInt', args);
            case 'NUMBER':
                return 'Number(' + args[0] + ')';
            case 'STRING':
                return methodCall(args[0], 'toString', []);
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
            case 'SUBSTR':
            case 'SUBSTRING':
                return methodCall(args[0], 'substring', args.slice(-(args.length - 1)));
            case 'TRIM':
                return methodCall(args[0], 'trim');
            case 'LTRIM':
                return methodCall(args[0], 'trimLeft');
            case 'RTRIM':
                return methodCall(args[0], 'trimRight');
            case 'MAX':
                if (args.length === 1) {
                    // TODO handle aggregation over the single expression.
                    return methodCall('Math', 'max', args);
                }
                return methodCall('Math', 'max', args);
            case 'MIN':
                if (args.length === 1) {
                    // TODO handle aggregation over the single expression.
                    return methodCall('Math', 'min', args);
                }
                return methodCall('Math', 'min', args);
            case 'GREATEST':
                return methodCall('Math', 'max', args);
            case 'LEAST':
                return methodCall('Math', 'min', args);
            // Unambiguously aggregate functions:
            case 'AVG':
            case 'AVERAGE':
            case 'COUNT':
            case 'MEDIAN':
            case 'SUM':
            case 'PCT':
            case 'PERCENTILE':
            case 'COUNT_DISTINCT':
            case 'DISTINCT_VALUES':
                throw new Error('Function not yet implemented: ' + inputFunctionName);
            case 'RAND':
                return methodCall('Math', 'random', args);
            case 'SIGN':
            case 'ABS':
            case 'SQRT':
            case 'EXP':
            case 'POW':
            case 'LOG':
            case 'LOG2':
            case 'LOG10':
            case 'CEIL':
            case 'FLOOR':
            case 'ROUND':
            case 'TRUNC':
            case 'SIN':
            case 'COS':
            case 'TAN':
            case 'ASIN':
            case 'ACOS':
            case 'ATAN':
            case 'RANDOM':
                return methodCall('Math', inputFunctionName.toLowerCase(), args);
            case 'LN':
                return methodCall('Math', 'log', args);
            case 'NULLIF':
                // "NULLIF(A, B)" => "IF A = B THEN NULL ELSE A END"
                return this.expressionStringForAST({
                    type: 'ConditionalExpression',
                    cases: [{
                        type: 'CaseBranch',
                        condition: {
                            type: 'EqualityPredicate',
                            operator: '=',
                            left: args[0],
                            right: args[1]
                        },
                        result: args[0]
                    }],
                    elseClause: args[1]
                });
            case 'COALESCE':
                return this.wrapSubExpressionPerPrecedences(args.join(' || '), this.precedenceOf('||'), outerPrecedence);
            default:
                throw new Error('Unrecognized function: ' + inputFunctionName);
        }
        return safeFunctionName + '(' + args.join(', ') + ')';
    },

    hasMultipleBindings: function (bindings) {
        return Object.keys(bindings).length > 1;
    },

    functionForAST: function (ast, bindings) {
        let source;
        const body = this.expressionStringForAST(ast, bindings);
        if (this.hasMultipleBindings(bindings)) {
            source = '(function () { return ' + body + '; })';
            logger.info('Evaluating (multi-column)', ast.type, source);
        } else {
            source = '(function (value) { return ' + body + '; })';
            logger.info('Evaluating (single-column)', ast.type, source);
        }
        logger.trace({ast: ast}, 'AST');
        return eval(source); // jshint ignore:line
    },

    transformedASTPerBindings: function (ast, bindings) {
        return _.mapObject(ast, (value, key) => {
            if (bindings.hasOwnProperty(key)) {
                return {type: 'Identifier', name: propertyAccessExprStringFor(key)};
            } else {
                return value;
            }
        });
    },

    localizedAST: function (ast) {
        const propertiesToLocalize = this.inputPropertiesFromAST(ast);
        const localized = _.mapObject(ast, (arg, key) => {
            if (_.contains(propertiesToLocalize, key)) {
                return {type: 'Identifier', name: key};
            } else {
                return arg;
            }
        });
        localized.isLocalized = true;
        return localized;
    },

    guardExpressionsForType: function (nativeType, identifier) {
        const guards = [];
        switch (nativeType) {
            case 'float':
            case 'double':
                guards.push({
                    type: 'BinaryPredicate',
                    operator: '=',
                    left: identifier,
                    right: {type: 'Literal', dataType: 'number', value: NaN}
                });
                break;
            case 'integer':
                guards.push({
                    type: 'BinaryPredicate',
                    operator: '=',
                    left: identifier,
                    right: {type: 'Literal', dataType: 'integer', value: 0x7FFFFFFF}
                });
                break;
            case 'number':
                // TODO distinguish float/double from integer.
                guards.push({
                    type: 'BinaryPredicate',
                    operator: 'IS',
                    left: identifier,
                    right: {type: 'Literal', dataType: 'number', value: NaN}
                });
                guards.push({
                    type: 'BinaryPredicate',
                    operator: '=',
                    left: identifier,
                    right: {type: 'Literal', dataType: 'integer', value: 0x7FFFFFFF}
                });
                break;
            case 'string':
                guards.push({
                    type: 'BinaryPredicate',
                    operator: '=',
                    left: identifier,
                    right: {type: 'Literal', dataType: 'string', value: '\0'}
                });
                // TODO retire 'n/a'
                guards.push({
                    type: 'BinaryPredicate',
                    operator: '=',
                    left: identifier,
                    right: {type: 'Literal', dataType: 'string', value: 'n/a'}
                });
                break;
        }
        return guards;
    },

    /**
     * Wraps the AST in clauses that check for values signifying undefined, for k-partite / partitioned domains.
     * @param {ClientQueryAST} ast
     * @param {Object.<ColumnName>} attributeData
     * @param {Dataframe} dataframe
     * @returns {ClientQueryAST}
     */
    transformASTForNullGuards: function (ast, attributeData, dataframe) {
        if (this.isPredicate(ast)) {
            const guards = [];
            _.each(attributeData, (attributeName) => {
                const nativeType = dataframe.getDataType(attributeName.attribute, attributeName.type),
                    identifier = {type: 'Identifier', name: attributeName.type + ':' + attributeName.attribute};
                _.each(this.guardExpressionsForType(nativeType, identifier), (guard) => {
                    guards.push(guard);
                });
            });
            return _.reduce(guards, (memo, guard) => {
                return {
                    type: 'BinaryPredicate',
                    operator: 'OR',
                    left: guard,
                    right: memo
                };
            }, ast);
        }
        return ast;
    },

    functionForPlanNode: function (planNode, bindings) {
        const result = this.planNodeExpressionStringForAST(planNode.ast, bindings);
        const source = '(function () { return ' + result.expr + '; })';
        logger.info('Evaluating (multi-column)', planNode.ast.type, source);
        result.executor = eval(source); // jshint ignore:line
        return result;
    },

    /** Evaluate an expression immediately, with no access to any bindings. */
    evaluateExpressionFree: function (ast) {
        const body = this.expressionStringForAST(ast, {});
        return eval(body); // jshint ignore:line
    },

    regularExpressionLiteralFromLikePattern: function (pattern, escapeChar) {
        if (!escapeChar) { escapeChar = '%'; }
        const re = new RegExp(escapeChar + '%|' + escapeChar + '_|' + '%|_', 'g');
        let match;
        const matches = [];
        let outputLiteralString = '';
        let lastMatchIndex = 0;
        while ((match = re.exec(pattern)) !== null) {
            matches.push(match);
        }
        if (matches.length === 0) {
            return escapeRegexNonPattern(pattern);
        }
        for (let i = 0; i < matches.length; i++) {
            match = matches[i];
            const patternSegment = pattern.substring(lastMatchIndex, match.index);
            // Avoid adding regex chars unquoted or numbers!
            outputLiteralString = outputLiteralString.concat(escapeRegexNonPattern(patternSegment));
            const matchString = match[0][0];
            lastMatchIndex = match.index + matchString.length;
            if (matchString.length === 2) {
                // Inline quoted pattern character:
                outputLiteralString += matchString[1];
            } else if (matchString === '%') {
                // Equivalent of % is .*:
                outputLiteralString += '.*';
            } else if (matchString === '_') {
                // Equivalent of _ is .:
                outputLiteralString += '.';
            } else {
                throw Error('Unrecognized match for LIKE placeholders: ' + matchString + ' at: ' + match.index);
            }
        }
        if (lastMatchIndex < pattern.length) {
            const lastPatternSegment = pattern.substring(lastMatchIndex);
            outputLiteralString = outputLiteralString.concat(escapeRegexNonPattern(lastPatternSegment));
        }
        return outputLiteralString;
    },

    regexExpressionForLikeOperator: function (ast, bindings, depth, outerPrecedence) {
        const caseInsensitive = ast.operator.toUpperCase() === 'ILIKE';
        const escapeChar = '%'; // Could override in AST via "LIKE pattern ESCAPE char"
        if (ast.right.type !== 'Literal') {
            throw Error('Computed text comparison patterns not yet implemented.');
        }
        /** @type {String} */
        const pattern = ast.right.value;
        let outputLiteralString = this.regularExpressionLiteralFromLikePattern(pattern, escapeChar);
        outputLiteralString = '/^' + outputLiteralString + '$/';
        if (caseInsensitive) {
            outputLiteralString += 'i';
        }
        const precedence = this.precedenceOf('.');
        const arg = this.expressionStringForAST(ast.left, bindings, depth + 1, precedence);
        const subExprString = arg + '.match(' + outputLiteralString + ')';
        return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
    },

    /**
     * Turns conditional case ASTs into chained/nested ?: expressions.
     * @param {ClientQueryAST[]} cases
     * @param {ClientQueryAST} elseClause
     * @param {Object} bindings
     * @param {Number} depth
     * @returns {string}
     */
    expressionForConditions: function (cases, elseClause, bindings, depth) {
        let resultStr = '';
        const precedence = this.precedenceOf('?:');
        _.each(cases, (caseExpr) => {
            const conditionArg = this.expressionStringForAST(caseExpr.condition, bindings, depth, precedence),
                resultArg = this.expressionStringForAST(caseExpr.result, bindings, depth, precedence);
            resultStr += conditionArg + ' ? ' + resultArg + ' : (';
        });
        if (elseClause === undefined) {
            resultStr += 'undefined';
        } else {
            resultStr += this.expressionStringForAST(elseClause, bindings, depth, precedence);
        }
        for (let i=0; i<cases.length; i++) {
            resultStr += ')';
        }
        return resultStr;
    },

    isPredicate: function (ast) {
        return _.isString(ast.type) && ast.type.endsWith('Predicate');
    },

    /**
     * @return {String[]}
     */
    inputPropertiesFromAST: function (ast) {
        switch (ast.type) {
            case 'BetweenPredicate':
                return InputPropertiesByShape.BetweenPredicate;
            case 'RegexPredicate':
            case 'LikePredicate':
            case 'BinaryPredicate':
            case 'BinaryExpression':
                return InputPropertiesByShape.BinaryExpression;
            case 'UnaryExpression':
                return InputPropertiesByShape.UnaryExpression;
            case 'CaseExpression':
                return InputPropertiesByShape.CaseExpression;
            case 'ConditionalExpression':
                return InputPropertiesByShape.ConditionalExpression;
            case 'CaseBranch':
                return InputPropertiesByShape.CaseBranch;
            case 'MemberAccess':
                return InputPropertiesByShape.MemberAccess;
            case 'MemberOfExpression':
                return InputPropertiesByShape.MemberOfExpression;
            case 'CastExpression':
            case 'NotExpression':
                return InputPropertiesByShape.NotExpression;
            case 'ListExpression':
                return InputPropertiesByShape.ListExpression;
            case 'FunctionCall':
                return InputPropertiesByShape.FunctionCall;
            case 'Literal':
            case 'Identifier':
                return undefined;
            default:
                throw new Error('Unrecognized type: ' + ast.type);
        }
    },

    /**
     * @param {ClientQueryAST} ast
     * @param {Object} bindings
     * @param {Number} depth
     * @param {Number} outerPrecedence
     * @returns {{ast: {ClientQueryAST}, expr: {String}}}
     */
    planNodeExpressionStringForAST: function (ast, bindings, depth, outerPrecedence) {
        if (depth === undefined) {
            depth = 0;
        }
        const precedence = this.precedenceOf('.');
        let subExprString;
        // const transformedAST = undefined && this.transformedASTPerBindings(ast, bindings);
        const localizedAST = this.localizedAST(ast);
        const depth2 = depth + 1;
        const localizedArgs = _.mapObject(_.pick(localizedAST, this.inputPropertiesFromAST(ast)), (arg) => {
            return this.expressionStringForAST(arg, bindings, depth2, precedence);
        });
        switch (ast.type) {
            case 'NotExpression':
                subExprString = localizedArgs.value + '.complement()';
                return {ast: localizedAST, expr: this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence)};
            case 'BinaryPredicate':
                switch (ast.operator.toUpperCase()) {
                    case 'AND':
                        subExprString = localizedArgs.left + '.intersection(' + localizedArgs.right + ')';
                        return {ast: localizedAST, expr: this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence)};
                    case 'OR':
                        subExprString = localizedArgs.left + '.union(' + localizedArgs.right + ')';
                        return {ast: localizedAST, expr: this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence)};
                    default:
                        return {ast: ast, expr: this.expressionStringForAST(ast, bindings, depth2, outerPrecedence)};
                }
            case 'ConditionalExpression':
            case 'CaseExpression':
            case 'BetweenPredicate':
            case 'RegexPredicate':
            case 'LikePredicate':
            case 'BinaryExpression':
            case 'UnaryExpression':
            case 'CastExpression':
            case 'ListExpression':
            case 'FunctionCall':
            case 'Literal':
            case 'Identifier':
                return {ast: ast, expr: this.expressionStringForAST(ast, bindings, depth2, outerPrecedence)};
            default:
                throw new Error('Unhandled expression type for planning: ' + ast.type);
        }
    },

    /**
     * Printed source form of the expression in JavaScript that executes the AST.
     * @param {ClientQueryAST} ast - From expression parser.
     * @param {Object} bindings - Specifies available names.
     * @param {Number} [depth] - Specifies depth, to use for pretty-printing/indents.
     * @param {Number} [outerPrecedence] - Surrounding expression precedence, determines whether result needs ().
     * @returns {String}
     */
    expressionStringForAST: function (ast, bindings, depth = 0, outerPrecedence = undefined) {
        if (typeof ast === 'string') {
            return ast;
        }
        let subExprString, operator, precedence, args, arg;
        const depth2 = depth + 1;
        switch (ast.type) {
            case 'NotExpression':
                precedence = this.precedenceOf('!');
                arg = this.expressionStringForAST(ast.value, bindings, depth2, precedence);
                return this.wrapSubExpressionPerPrecedences('!' + arg, precedence, outerPrecedence);
            case 'BetweenPredicate':
                precedence = this.precedenceOf('&&');
                args = _.mapObject(_.pick(ast, InputPropertiesByShape.BetweenPredicate), (arg) => {
                    return this.expressionStringForAST(arg, bindings, depth2, this.precedenceOf('<='));
                });
                subExprString = args.value + ' >= ' + args.start +
                    ' && ' + args.value + ' <= ' + args.stop;
                return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
            case 'RegexPredicate':
                precedence = this.precedenceOf('.');
                args = _.mapObject(_.pick(ast, InputPropertiesByShape.BinaryExpression), (arg) => {
                    return this.expressionStringForAST(arg, bindings, depth2, this.precedenceOf('<='));
                });
                subExprString = '(new RegExp(' + args.right + ')).test(' + args.left + ')';
                return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
            case 'LikePredicate': {
                if (ast.right.type !== 'Literal') {
                    throw Error('Computed text comparison patterns not yet implemented.');
                }
                const pattern = ast.right.value;
                switch (ast.operator.toUpperCase()) {
                    case 'LIKE': {
                        precedence = this.precedenceOf('.');
                        arg = this.expressionStringForAST(ast.left, bindings, depth2, precedence);
                        let prefix, suffix;
                        const lastPatternIndex = pattern.length - 1;
                        if (pattern.startsWith('%') && pattern.endsWith('%') &&
                            pattern.length > 2 && pattern.match(/%/g).length === 2) {
                            const substring = pattern.slice(1, lastPatternIndex);
                            // ES6 could replace with String.includes():
                            precedence = this.precedenceOf('!==');
                            subExprString = arg + '.indexOf(' + literalExpressionFor(substring) + ') !== -1';
                        } else if (pattern.indexOf('%') !== pattern.lastIndexOf('%')) {
                            return this.regexExpressionForLikeOperator(ast, bindings, depth, outerPrecedence);
                        } else if (pattern.startsWith('%')) {
                            suffix = pattern.slice(-lastPatternIndex);
                            subExprString = arg + '.endsWith(' + literalExpressionFor(suffix) + ')';
                        } else if (pattern.endsWith('%')) {
                            prefix = pattern.slice(0, lastPatternIndex);
                            subExprString = arg + '.startsWith(' + literalExpressionFor(prefix) + ')';
                        } else {
                            const index = pattern.indexOf('%');
                            if (index === -1) {
                                precedence = this.precedenceOf('===');
                                subExprString = arg + ' === ' + literalExpressionFor(pattern);
                            } else {
                                prefix = pattern.slice(0, index);
                                suffix = pattern.slice(-(lastPatternIndex - index));
                                precedence = this.precedenceOf('&&');
                                subExprString = arg + '.endsWith(' + literalExpressionFor(suffix) + ') && ' +
                                    arg + '.startsWith(' + literalExpressionFor(prefix) + ')';
                            }
                        }
                        return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
                    }
                    case 'ILIKE':
                        return this.regexExpressionForLikeOperator(ast, bindings, depth, outerPrecedence);
                    default:
                        throw Error('Operator not yet implemented: ' + ast.operator);
                }
            }
            case 'EqualityPredicate':
            case 'BinaryPredicate':
            case 'BinaryExpression':
                operator = ast.operator.toUpperCase();
                // Maybe InExpression would be a better logic branch:
                if (operator === 'IN') {
                    precedence = this.precedenceOf('!==');
                    args = _.map([ast.left, ast.right], (subArg) => {
                        return this.expressionStringForAST(subArg, bindings, depth2, precedence);
                    });
                    subExprString = args[1] + '.indexOf(' + args[0] + ') !== -1';
                    return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
                } else if (operator === '**') {
                    precedence = this.precedenceOf('(');
                    args = _.map([ast.left, ast.right], (subArg) => {
                        return this.expressionStringForAST(subArg, bindings, depth2, precedence);
                    });
                    subExprString = 'Math.pow(' + args[0] + ', ' + args[1] + ')';
                    return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
                }
                operator = this.translateOperator(operator);
                precedence = this.precedenceOf(operator);
                args = _.map([ast.left, ast.right], (subArg) => {
                    return this.expressionStringForAST(subArg, bindings, depth2, precedence);
                });
                // Special-case NAN equality/comparison:
                if (ast.right.type === 'Literal' && ast.right.dataType === 'number' &&
                    isNaN(ast.right.value)) {
                    precedence = this.precedenceOf('(');
                    if (operator === '===') {
                        subExprString = 'isNaN(' + args[0] + ')';
                    } else if (operator === '!==') {
                        subExprString = '!isNaN(' + args[0] + ')';
                    } else {
                        subExprString = [args[0], operator, args[1]].join(' ');
                    }
                } else {
                    subExprString = [args[0], operator, args[1]].join(' ');
                }
                return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
            case 'UnaryExpression':
                operator = ast.operator.toUpperCase();
                if (operator === 'ISNULL') {
                    operator = '===';
                    precedence = this.precedenceOf(operator);
                    arg = this.expressionStringForAST(ast.argument, bindings, depth2, precedence);
                    subExprString = [arg, operator, 'null'].join(' ');
                } else if (operator === 'NOTNULL') {
                    operator = '!==';
                    precedence = this.precedenceOf(operator);
                    arg = this.expressionStringForAST(ast.argument, bindings, depth2, precedence);
                    subExprString = [arg, operator, 'null'].join(' ');
                } else if (operator === 'DEFINED') {
                    operator = '!==';
                    precedence = this.precedenceOf(operator);
                    arg = this.expressionStringForAST(ast.argument, bindings, depth2, precedence);
                    subExprString = [arg, operator, 'undefined'].join(' ');
                } else if (operator === 'UNDEFINED') {
                    operator = '===';
                    precedence = this.precedenceOf(operator);
                    arg = this.expressionStringForAST(ast.argument, bindings, depth2, precedence);
                    subExprString = [arg, operator, 'undefined'].join(' ');
                } else {
                    operator = this.translateOperator(operator);
                    precedence = this.precedenceOf(operator, ast.fixity);
                    arg = this.expressionStringForAST(ast.argument, bindings, depth2, precedence);
                    switch (ast.fixity) {
                        case 'prefix':
                            subExprString = operator + ' ' + arg;
                            break;
                        case 'postfix':
                            subExprString = arg + ' ' + operator;
                            break;
                    }
                }
                return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
            case 'CastExpression': {
                const value = ast.value;
                // This is a load of silly guards because the PEG production for TypeIdentifier needs cleanup:
                let typeName = ast.type_name;
                while (typeof typeName !== 'string') {
                    if (typeName.length) {
                        typeName = typeName[0];
                    } else if (typeName.name) {
                        typeName = typeName.name;
                    }
                }
                let castValue, castArg;
                switch (typeName.toLowerCase()) {
                    case 'string':
                        precedence = this.precedenceOf('.');
                        castArg = this.expressionStringForAST(value, bindings, depth2, precedence);
                        castValue = castArg + '.toString()';
                        break;
                    case 'integer':
                        precedence = this.precedenceOf('(');
                        castArg = this.expressionStringForAST(value, bindings, depth2, precedence);
                        castValue = 'parseInt(' + castArg + ')';
                        break;
                    case 'number':
                        precedence = this.precedenceOf('(');
                        castArg = this.expressionStringForAST(value, bindings, depth2, precedence);
                        castValue = 'Number(' + castArg + ')';
                        break;
                    case 'boolean':
                        precedence = this.precedenceOf('!');
                        castArg = this.expressionStringForAST(value, bindings, depth2, precedence);
                        castValue = '!!' + castArg;
                        break;
                    case 'null':
                        castValue = castArg = 'null';
                        break;
                    case 'array':
                        // Wraps the object in a single-slot Array. This is the simplest interpretation but workable:
                        precedence = this.precedenceOf('[');
                        castArg = this.expressionStringForAST(value, bindings, depth2, precedence);
                        castValue = '[' + castArg + ']';
                        break;
                    case 'date':
                    case 'timestamp':
                        // Should only accept a date string or the number of seconds since the epoch this way:
                        precedence = this.precedenceOf('(');
                        castArg = this.expressionStringForAST(value, bindings, depth2, precedence);
                        castValue = 'new Date(' + castArg + ')';
                        break;
                    case 'time':
                        precedence = this.precedenceOf('(');
                        castArg = this.expressionStringForAST(value, bindings, depth2, precedence);
                        castValue = 'new Date(' + castArg + ').getTime()';
                        break;
                    default:
                        throw Error('Unrecognized type: ' + typeName);
                }
                return castValue;
            }
            case 'CaseExpression': {
                // Turns case statement into if statements.
                const caseComparison = ast.value;
                let cases = ast.cases;
                if (caseComparison !== undefined) {
                    cases = _.map(cases, (caseAST) => {
                        return {
                            type: 'EqualityPredicate',
                            operator: '=',
                            left: caseComparison,
                            right: caseAST
                        };
                    });
                }
                return this.expressionForConditions(cases, ast.elseClause, bindings, depth2);
            }
            case 'ConditionalExpression':
                return this.expressionForConditions(ast.cases, ast.elseClause, bindings, depth2);
            case 'CaseBranch':
                return this.expressionForConditions([ast], undefined, bindings, depth2);
            case 'Literal':
                return literalExpressionFor(ast.value, ast.dataType);
            case 'ListExpression':
                args = _.map(ast.elements, (subArg) => {
                    return this.expressionStringForAST(subArg, bindings, depth2, this.precedenceOf('('));
                });
                return '[' + args.join(', ') + ']';
            case 'FunctionCall':
                args = _.map(ast.arguments, (subArg) => {
                    return this.expressionStringForAST(subArg, bindings, depth2, this.precedenceOf('('));
                });
                return this.expressionForFunctionCall(ast.callee.name, args, outerPrecedence);
            case 'MemberAccess':
                precedence = this.precedenceOf('[');
                args = _.mapObject(_.pick(ast, InputPropertiesByShape.MemberAccess), (arg) => {
                    return this.expressionStringForAST(arg, bindings, depth2, precedence);
                });
                subExprString = args.object + '[' + args.property + ']';
                return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
            case 'Identifier':
                if (this.hasMultipleBindings(bindings)) {
                    const unsafeInputName = ast.name;
                    // Delete all non-word characters, but keep colons and dots.
                    const inputName = unsafeInputName.replace(/[^\w:]/, '', 'g');
                    const inputNameParts = inputName.split(/:/);
                    if (inputNameParts.length === 0) {
                        return 'undefined';
                    }
                    let scope = bindings;
                    if (inputNameParts.length > 1) {
                        switch (inputNameParts[0]) {
                            case 'point':
                                scope = scope.point;
                                break;
                            case 'edge':
                                scope = scope.edge;
                                break;
                        }
                    }
                    const lastInputPart = inputNameParts[inputNameParts.length - 1];
                    let contextProperty = scope[lastInputPart];
                    if (contextProperty === undefined) {
                        contextProperty = inputName;
                    }
                    return this.wrapSubExpressionPerPrecedences(
                        propertyAccessExprStringFor(contextProperty),
                        this.precedenceOf('['), outerPrecedence);
                }
                return 'value';
            default:
                throw Error('Unrecognized type on AST node: ' + ast.type);
        }
    }
};

export default ExpressionCodeGenerator;

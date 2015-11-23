'use strict';

var _ = require('underscore');
var ExpressionCodeGenerator = require('./expressionCodeGenerator.js');

var ReturnTypes = {
    Positions: 'Positions', // Signifies a predicate, effectively returning a boolean value.
    Values: 'Values' // Signifies an expression returning a value.
};

function PlanNode(ast, inputNodes, attributeName) {
    this.ast = ast;
    this.inputNodes = inputNodes || [];
    this.attributeName = attributeName;
}

PlanNode.prototype = {
    compile: function (generator, dataframe) {
        if (this.canRunOnOneColumn()) {
            this.executor = generator.functionForAST(this.ast, {'*': 'value'});
        } else {
            this.executor = generator.planNodeFunctionForAST(this.ast, this.inputNodes, dataframe.getColumnsByType());
        }
        _.mapObject(this.inputNodes, function (inputNode) {
            inputNode.compile(generator, dataframe);
        });
    },

    /**
     * @param {Dataframe} dataframe
     * @param {Boolean} valuesRequired
     * @returns {Array|DataframeMask}
     */
    execute: function (dataframe, valuesRequired) {
        var results;
        if (this.canRunOnOneColumn()) {
            var normalization = dataframe.normalizeAttributeName(this.attributeName);
            var returnType = this.returnType();
            if (valuesRequired && returnType === ReturnTypes.Positions) {
                returnType = ReturnTypes.Values;
            }
            switch (returnType) {
                case ReturnTypes.Positions:
                    results = dataframe.getAttributeMask(normalization.type, normalization.attribute, this.executor);
                    break;
                case ReturnTypes.Values:
                    results = dataframe.mapToAttribute(normalization.type, normalization.attribute, this.executor);
                    break;
            }
        } else {
            valuesRequired = _.any(this.inputNodes, function (inputNode) {
                return inputNode.returnType() === ReturnTypes.Values;
            });
            var inputResults = _.mapObject(this.inputNodes, function (inputNode) {
                return inputNode.execute(dataframe, valuesRequired);
            });
            results = this.executor.call(inputResults);
        }
        return results;
    },

    /**
     * This recursively builds a hash by name of nodes in the plan representing separate identifiers.
     * @param {Object} result
     * @returns {Object}
     */
    identifierNodes: function (result) {
        if (result === undefined) { result = {}; }
        if (this.ast.type === 'Identifier') {
            var identifierName = this.ast.name;
            if (result[identifierName] === undefined) { result[identifierName] = []; }
            result[identifierName].push(this);
        }
        _.mapObject(this.inputNodes, function (inputNode) {
            inputNode.identifierNodes(result);
        });
        return result;
    },

    /**
     * This recursively counts identifiers in the input nodes' ASTs.
     * @returns {number}
     */
    arity: function () {
        if (this.ast.type === 'Identifier') {
            return 1;
        }
        var identifierCount = 0;
        _.mapObject(this.inputNodes, function (inputNode) {
            identifierCount += inputNode.arity();
        });
        return identifierCount;
    },

    isPlanLeaf: function () { return this.arity() === 0; },

    canRunOnOneColumn: function () {
        return this.arity() <= 1;
    },

    returnTypeOfAST: function (ast) {
        switch (ast.type) {
            case 'BetweenPredicate':
            case 'RegexPredicate':
            case 'LikePredicate':
            case 'BinaryPredicate':
                return ReturnTypes.Positions;
            case 'BinaryExpression':
            case 'UnaryExpression':
            case 'NotExpression':
            case 'CastExpression':
            case 'Literal':
            case 'ListExpression':
            case 'FunctionCall':
            case 'Identifier':
                return ReturnTypes.Values;
        }
        return ReturnTypes.Positions;
    },

    returnType: function () { return this.returnTypeOfAST(this.ast); }
};

/**
 * @param {Dataframe} dataframe
 * @param {ClientQueryAST} ast
 * @constructor
 */
function ExpressionPlan(dataframe, ast) {
    this.codeGenerator = new ExpressionCodeGenerator();
    this.rootNode = this.planFromAST(ast);
    this.dataframe = dataframe;
    this.compile();
}

ExpressionPlan.prototype = {
    compile: function () {
        this.rootNode.compile(this.codeGenerator, this.dataframe);
    },

    /**
     * @returns {Array|DataframeMask}
     */
    execute: function () {
        return this.rootNode.execute(this.dataframe);
    },

    /**
     * @param {ClientQueryAST} ast
     * @param {PlanNode[]} inputNodes
     * @returns {PlanNode}
     */
    combinePlanNodes: function (ast, inputNodes) {
        // List all nodes under their attribute if they have one.
        var attributeNames = {};
        _.each(inputNodes, function (inputNode) {
            var attributeName = inputNode.attributeName;
            if (attributeName !== undefined) {
                if (attributeNames[attributeName] === undefined) {
                    attributeNames[attributeName] = [];
                }
                attributeNames[attributeName].push(inputNode);
            }
        });
        if (_.size(attributeNames) > 1) {
            return new PlanNode(ast, inputNodes);
        } else {
            return new PlanNode(ast, inputNodes, _.findKey(attributeNames));
        }
    },

    /**
     *
     * @param {ClientQueryAST} ast - From expression parser.
     * @return {PlanNode}
     */
    planFromAST: function (ast) {
        switch (ast.type) {
            case 'Literal':
            case 'Identifier':
                return new PlanNode(ast, undefined, ast.name);
        }
        var inputProperties = this.codeGenerator.inputPropertiesFromAST(ast);
        if (inputProperties !== undefined) {
            var inputResults = _.mapObject(_.pick(ast, inputProperties), function (inputAST) {
                return this.planFromAST(inputAST);
            }.bind(this));
            return this.combinePlanNodes(ast, inputResults);
        }
        throw new Error('Unhandled input to plan: ' + ast.type);
    }
};

module.exports = ExpressionPlan;

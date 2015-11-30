'use strict';

var _ = require('underscore');
var ExpressionCodeGenerator = require('./expressionCodeGenerator.js');

var ReturnTypes = {
    Positions: 'Positions', // Signifies a predicate, effectively returning a boolean value.
    Values: 'Values' // Signifies an expression returning a value.
};

/**
 * @param {ClientQueryAST} ast
 * @param {PlanNode[]} inputNodes
 * @param {Object.<AttributeName>} attributeData
 * @constructor
 */
function PlanNode(ast, inputNodes, attributeData) {
    this.ast = ast;
    this.inputNodes = inputNodes || [];
    this.attributeData = attributeData;
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
            _.each(this.attributeData, function (attributeData) {
                var returnType = this.returnType();
                if (valuesRequired && returnType === ReturnTypes.Positions) {
                    returnType = ReturnTypes.Values;
                }
                switch (returnType) {
                    case ReturnTypes.Positions:
                        results = dataframe.getAttributeMask(attributeData.type, attributeData.attribute, this.executor);
                        break;
                    case ReturnTypes.Values:
                        results = dataframe.mapToAttribute(attributeData.type, attributeData.attribute, this.executor);
                        break;
                }
            }.bind(this));
        } else {
            if (this.returnType() === ReturnTypes.Values) {
                var iterationType;
                var bindings = _.mapObject(this.attributeData, function (attributeData) {
                    if (iterationType === undefined) {
                        iterationType = attributeData.type;
                    } else if (attributeData.type !== iterationType) {
                        throw new Error('Unsupported: multi-column expression over points and edges together.');
                    }
                    return dataframe.getBuffer(attributeData.name, attributeData.type);
                });
                var numElements = dataframe.numByType(iterationType);
                results = new Array(numElements);
                var bindingKeys = _.keys(bindings);
                var perElementBindings = _.mapObject(bindings, function () { return undefined; });
                for (var i=0; i<numElements; i++) {
                    for (var j=0; j<bindingKeys.length; j++) {
                        var attributeName = bindingKeys[j];
                        perElementBindings[attributeName] = bindings[attributeName][i];
                    }
                    results[i] = this.executor.call(perElementBindings);
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
    this.rootNode = this.planFromAST(ast, dataframe);
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
        var attributesByName = {};
        var attributesByType = {};
        _.each(inputNodes, function (inputNode) {
            _.each(inputNode.attributeData, function (attributeData) {
                var attributeName = attributeData.attribute;
                if (attributeName !== undefined) {
                    if (attributesByName[attributeName] === undefined) {
                        attributesByName[attributeName] = [];
                    }
                    attributesByName[attributeName].push(inputNode);
                }
                var attributeType = attributeData.type;
                if (attributeType !== undefined) {
                    if (attributesByType[attributeType] === undefined) {
                        attributesByType[attributeType] = [];
                    }
                    attributesByType[attributeType].push(inputNode);
                }
            });
        });
        // Disabled because we can't detect this correctly until execute().
        if (false && _.size(attributesByType) > 1) {
            throw new Error('Cannot mix point and edge computations except via set aggregation.');
        }
        return new PlanNode(ast, inputNodes, attributesByName);
    },

    /**
     * @param {ClientQueryAST} ast - From expression parser.
     * @param {Dataframe} dataframe - Normalizes attributes.
     * @return {PlanNode}
     */
    planFromAST: function (ast, dataframe) {
        switch (ast.type) {
            case 'Identifier':
                var attributeData = {};
                var attributeName = dataframe.normalizeAttributeName(ast.name);
                attributeData[attributeName.attribute] = attributeName;
                return new PlanNode(ast, undefined, attributeData);
            case 'Literal':
                return new PlanNode(ast);
        }
        var inputProperties = this.codeGenerator.inputPropertiesFromAST(ast);
        if (inputProperties !== undefined) {
            var inputResults = _.mapObject(_.pick(ast, inputProperties), function (inputAST) {
                return this.planFromAST(inputAST, dataframe);
            }.bind(this));
            return this.combinePlanNodes(ast, inputResults);
        }
        throw new Error('Unhandled input to plan: ' + ast.type);
    }
};

module.exports = ExpressionPlan;

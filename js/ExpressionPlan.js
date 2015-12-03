'use strict';

var _ = require('underscore');
var ExpressionCodeGenerator = require('./expressionCodeGenerator.js');
var DataframeMask = require('./DataframeMask.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:driver:planner');

var ReturnTypes = {
    Positions: 'Positions', // Signifies a predicate, effectively returning a boolean value.
    Values: 'Values' // Signifies an expression returning a value.
};

function LocalBindings() {
    this.attributes = [];
}

function attributeDataEquals (x, y) {
    return x.attribute === y.attribute && x.type === y.type;
}

LocalBindings.prototype = {
    includes: function (attributeData) {
        return _.any(this.attributes, function (eachAttribute) {
            return attributeDataEquals(eachAttribute, attributeData);
        });
    },

    include: function (attributeData) {
        var found = _.find(this.attributes, function (eachAttribute) {
            return attributeDataEquals(eachAttribute, attributeData);
        });
        if (found === undefined) {
            found = attributeData;
            this.attributes.push(attributeData);
        }
        return found;
    },

    attributesByType: function () {
        var result = {};
        _.each(this.attributes, function (eachAttribute) {
            var type = eachAttribute.type;
            if (result[type] === undefined) {
                result[type] = {};
            }
            result[type][eachAttribute.attribute] = eachAttribute;
        });
        return result;
    },

    attributesByName: function () {
        var result = {};
        _.each(this.attributes, function (eachAttribute) {
            var attribute = eachAttribute.attribute;
            if (result[attribute] === undefined) {
                result[attribute] = eachAttribute;
            }
        });
        return result;
    },

    hasIncompatibleTypes: function () {
        var typeKeys = {};
        _.each(this.attributes, function (eachAttribute) {
            typeKeys[eachAttribute.type] = true;
        });
        return _.keys(typeKeys).length > 1;
    }
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
    this.inferBindings();
}

PlanNode.prototype = {
    inferBindings: function () {
        var bindings = new LocalBindings();
        this.eachNode(function (inputNode) {
            inputNode.eachAttribute(function (attributeData) {
                bindings.include(attributeData);
            });
        });
        // Disabled because we can't detect this correctly until execute().
        if (bindings.hasIncompatibleTypes()) {
            throw new Error('Cannot mix point and edge computations except via set aggregation.');
        }
        this.bindings = bindings;
        if (this.attributeData === undefined) {
            this.attributeData = bindings.attributesByName();
        }
    },

    compile: function (generator, dataframe) {
        if (this.canRunOnOneColumn()) {
            this.executor = generator.functionForAST(this.ast, {'*': 'value'});
        } else {
            this.executor = generator.functionForPlanNode(this, dataframe.getColumnsByType());
        }
        this.eachNode(function (eachNode) {
            eachNode.compile(generator, dataframe);
        });
    },

    /**
     * @param {Dataframe} dataframe
     * @param {Boolean} valuesRequired
     * @returns {Array|DataframeMask}
     */
    execute: function (dataframe, valuesRequired) {
        if (this.canRunOnOneColumn()) {
            var returnType = this.returnType(), executor = this.executor;
            var attributeName = _.find(this.attributeData);
            if (valuesRequired && returnType === ReturnTypes.Positions) {
                returnType = ReturnTypes.Values;
            }
            switch (returnType) {
                case ReturnTypes.Positions:
                    return dataframe.getAttributeMask(attributeName.type, attributeName.attribute, executor);
                case ReturnTypes.Values:
                    return dataframe.mapToAttribute(attributeName.type, attributeName.attribute, executor);
            }
        } else {
            var iterationType = this.iterationType();
            var numElements = dataframe.numByType(iterationType);
            var bindingKeys, bindings, perElementBindings, i, j, attribute;
            if (this.returnType() === ReturnTypes.Values) {
                bindings = _.mapObject(this.attributeData, function (attributeName) {
                    return dataframe.getColumnValues(attributeName.attribute, attributeName.type);
                });
                bindingKeys = _.keys(bindings);
                perElementBindings = _.mapObject(this.attributeData, function () { return undefined; });
                var resultValues = new Array(numElements);
                for (i=0; i<numElements; i++) {
                    for (j=0; j<bindingKeys.length; j++) {
                        attribute = bindingKeys[j];
                        perElementBindings[attribute] = bindings[attribute][i];
                    }
                    resultValues[i] = this.executor.call(perElementBindings);
                }
                return resultValues;
            } else {
                valuesRequired = _.any(this.inputNodes, function (inputNode) {
                    return inputNode.returnType() === ReturnTypes.Values;
                });
                bindings = _.mapObject(this.inputNodes, function (inputNode) {
                    if (_.isArray(inputNode)) {
                        return _.map(inputNode, function (eachNode) {
                            return eachNode.execute(dataframe, valuesRequired);
                        });
                    } else {
                        return inputNode.execute(dataframe, valuesRequired);
                    }
                });
                bindingKeys = _.keys(bindings);
                perElementBindings = _.mapObject(this.inputNodes, function () { return undefined; });
                var mask = [];
                for (i=0; i<numElements; i++) {
                    for (j=0; j<bindingKeys.length; j++) {
                        attribute = bindingKeys[j];
                        perElementBindings[attribute] = bindings[attribute][i];
                    }
                    if (this.executor.call(perElementBindings)) {
                        mask.push(i);
                    }
                }
                var pointMask = iterationType === 'point' ? mask : undefined;
                var edgeMask = iterationType === 'edge' ? mask : undefined;
                return new DataframeMask(dataframe, pointMask, edgeMask);
            }
        }
        return undefined;
    },

    iterationType: function () {
        var result;
        _.each(this.attributeData, function (attributeName) {
            if (result === undefined) {
                result = attributeName.type;
            }
        });
        return result || 'point';
    },

    eachAttribute: function (attributeIterator) {
        _.each(this.attributeData, function (attributeName, key) {
            attributeIterator(attributeName, key);
        });
    },

    eachNode: function (nodeIterator) {
        _.each(this.inputNodes, function (eachNode, key) {
            if (_.isArray(eachNode)) {
                _.each(eachNode, nodeIterator);
            } else {
                nodeIterator(eachNode, key);
            }
        });
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
        this.eachNode(function (eachNode) {
            eachNode.identifierNodes(result);
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
        this.eachNode(function (eachNode) {
            identifierCount += eachNode.arity();
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
            case 'Identifier':
                return ReturnTypes.Values;
            case 'FunctionCall':
                switch (ast.callee.name.toUpperCase()) {
                    case 'STARTSWITH':
                    case 'ENDSWITH':
                    case 'CONTAINS':
                    case 'ISBLANK':
                    case 'ISEMPTY':
                        return ReturnTypes.Positions;
                    default:
                        return ReturnTypes.Values;
                }
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
     * @param {ClientQueryAST} ast - From expression parser.
     * @param {Dataframe} dataframe - Normalizes attributes.
     * @return {PlanNode}
     */
    planFromAST: function (ast, dataframe) {
        var inputProperties = this.codeGenerator.inputPropertiesFromAST(ast);
        if (inputProperties === undefined) {
            switch (ast.type) {
                case 'Identifier':
                    var attributeData = {};
                    var attributeName = dataframe.normalizeAttributeName(ast.name);
                    if (attributeName !== undefined) {
                        attributeData[attributeName.attribute] = attributeName;
                    }
                    return new PlanNode(ast, undefined, attributeData);
                case 'Literal':
                    return new PlanNode(ast);
                default:
                    throw new Error('Unhandled input to plan: ' + ast.type);
            }
        }
        var inputResults = _.mapObject(_.pick(ast, inputProperties), function (inputAST) {
            if (_.isArray(inputAST)) {
                return _.map(inputAST, function (eachAST) {
                    return this.planFromAST(eachAST, dataframe);
                }.bind(this));
            } else {
                return this.planFromAST(inputAST, dataframe);
            }
        }.bind(this));
        return new PlanNode(ast, inputResults);
    }
};

module.exports = ExpressionPlan;

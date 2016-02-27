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

    /**
     * @param {ExpressionCodeGenerator} generator
     * @param {Dataframe} dataframe
     */
    compile: function (generator, dataframe) {
        this.ast = generator.transformASTForNullGuards(this.ast, this.attributeData, dataframe);
        if (this.isConstant()) {
            this.executor = undefined;
        } else if (this.canRunOnOneColumn()) {
            this.executor = generator.functionForAST(this.ast, {'*': 'value'});
        } else {
            var planNodeResult = generator.functionForPlanNode(this, dataframe.getColumnsByType());
            this.isLocalized = planNodeResult.ast.isLocalized;
            this.executor = planNodeResult.executor;
        }
        this.eachNode(function (eachNode) {
            eachNode.compile(generator, dataframe);
        });
    },

    /**
     * @param {Dataframe} dataframe
     * @param {Boolean} valuesRequired
     * @param {String} iterationType
     * @returns {Array|DataframeMask}
     */
    execute: function (dataframe, valuesRequired, iterationType) {
        if (iterationType === undefined) {
            iterationType = this.iterationType();
        } else if (iterationType !== this.iterationType()) {
            throw new Error('Using an expression of iteration type ' + this.iterationType() + ' within ' + iterationType);
        }
        var numElements = dataframe.numByType(iterationType), i= 0, resultValues;
        var returnType = this.returnType();
        if (this.isConstant()) {
            // map constant values to the iteration types.
            // TODO: don't allocate all this (challenge is combining this return value with other arrays/masks).
            resultValues = new Array(numElements);
            var value = this.ast.value;
            //resultValues.fill(this.ast.value);
            for (i=0; i<numElements; i++) {
                resultValues[i] = value;
            }
            return resultValues;
        } else if (this.canRunOnOneColumn()) {
            var attributeName = _.find(this.attributeData);
            if (valuesRequired && returnType === ReturnTypes.Positions) {
                returnType = ReturnTypes.Values;
            }
            switch (returnType) {
                case ReturnTypes.Values:
                    if (this.ast.type === 'Identifier') {
                        return dataframe.getUnfilteredColumnValues(attributeName.type, attributeName.attribute);
                    } else {
                        return dataframe.mapUnfilteredColumnValues(attributeName.type, attributeName.attribute, this.executor);
                    }
                    break;
                case ReturnTypes.Positions:
                /* falls through */
                default:
                    return dataframe.getAttributeMask(attributeName.type, attributeName.attribute, this.executor);
            }
        } else {
            var j, attribute, bindings;
            if (this.isLocalized) {
                valuesRequired = _.any(this.inputNodes, function (inputNode) {
                    return inputNode.returnType() === ReturnTypes.Values;
                });
                bindings = _.mapObject(this.inputNodes, function (inputNode) {
                    if (_.isArray(inputNode)) {
                        return _.map(inputNode, function (eachNode) {
                            return eachNode.execute(dataframe, valuesRequired, iterationType);
                        });
                    } else {
                        return inputNode.execute(dataframe, valuesRequired, iterationType);
                    }
                });
            } else {
                bindings = _.mapObject(this.attributeData, function (attributeName) {
                    return dataframe.getUnfilteredColumnValues(attributeName.type, attributeName.attribute);
                });
            }
            var bindingKeys = _.keys(bindings);
            var perElementBindings = _.mapObject(bindings, function () { return undefined; });
            if (this.returnType() === ReturnTypes.Values) {
                resultValues = new Array(numElements);
                for (i=0; i<numElements; i++) {
                    for (j=0; j<bindingKeys.length; j++) {
                        attribute = bindingKeys[j];
                        perElementBindings[attribute] = bindings[attribute][i];
                    }
                    resultValues[i] = this.executor.call(perElementBindings);
                }
                return resultValues;
            } else if (this.isLocalized) {
                return this.executor.call(bindings);
            } else {
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
                switch (iterationType) {
                    case 'point':
                        return new DataframeMask(dataframe, mask, undefined);
                    case 'edge':
                        return new DataframeMask(dataframe, undefined, mask);
                    default:
                        throw new Error('Unhandled iteration type for masks: ' + iterationType);
                }
            }
        }
        throw new Error('Unable to execute plan node', this);
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
        if (this.ast.type === 'Literal') {
            return 0;
        }
        var identifierNodes = this.identifierNodes();
        return _.size(identifierNodes);
    },

    isConstant: function () { return this.arity() === 0; },

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
    /** @type PlanNode */
    this.rootNode = this.planFromAST(ast, dataframe);
    /** @type Dataframe */
    this.dataframe = dataframe;
    this.compile();
}

ExpressionPlan.prototype = {
    compile: function () {
        this.rootNode.compile(this.codeGenerator, this.dataframe);
    },

    isRedundant: function () {
        return this.rootNode.canRunOnOneColumn();
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

'use strict';

const _ = require('underscore');
import ExpressionCodeGenerator from './expressionCodeGenerator.js';
import DataframeMask from './DataframeMask.js';

const ReturnTypes = {
    Positions: 'Positions', // Signifies a predicate, effectively returning a boolean value.
    Values: 'Values', // Signifies an expression returning a value.
    Sort: 'Sort'
};

function LocalBindings() {
    // TODO replace with a Set.
    this.attributes = [];
}

function attributeDataEquals(x, y) {
    return x.attribute === y.attribute && x.type === y.type;
}

LocalBindings.prototype = {
    /**
     * @param {ColumnName} attributeData
     * @returns {boolean}
     */
    includes: function(attributeData) {
        return _.any(this.attributes, eachAttribute =>
            attributeDataEquals(eachAttribute, attributeData)
        );
    },

    /**
     * @param {ColumnName} attributeData
     * @returns {ColumnName}
     */
    include: function(attributeData) {
        let found = _.find(this.attributes, eachAttribute =>
            attributeDataEquals(eachAttribute, attributeData)
        );
        if (found === undefined) {
            found = attributeData;
            this.attributes.push(attributeData);
        }
        return found;
    },

    attributesByType: function() {
        const result = {};
        _.each(this.attributes, eachAttribute => {
            const type = eachAttribute.type;
            if (result[type] === undefined) {
                result[type] = {};
            }
            result[type][eachAttribute.attribute] = eachAttribute;
        });
        return result;
    },

    attributesByName: function() {
        const result = {};
        _.each(this.attributes, eachAttribute => {
            const attribute = eachAttribute.attribute;
            if (result[attribute] === undefined) {
                result[attribute] = eachAttribute;
            }
        });
        return result;
    },

    hasIncompatibleTypes: function() {
        const typeKeys = {};
        _.each(this.attributes, eachAttribute => {
            typeKeys[eachAttribute.type] = true;
        });
        return _.keys(typeKeys).length > 1;
    }
};

/**
 * @param {ClientQueryAST} ast
 * @param {PlanNode[]} inputNodes
 * @param {Object.<ColumnName>} attributeData
 * @constructor
 */
function PlanNode(ast, inputNodes = [], attributeData = {}, guardNulls = true) {
    this.ast = ast;
    this.inputNodes = inputNodes;
    this.attributeData = attributeData;
    this.guardNulls = guardNulls;
    this.inferBindings();
}

PlanNode.prototype = {
    inferBindings: function() {
        const bindings = new LocalBindings();
        this.eachNode(inputNode => {
            inputNode.eachAttribute(attributeData => {
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
    compile: function(generator, dataframe) {
        if (this.guardNulls) {
            this.ast = generator.transformASTForNullGuards(this.ast, this.attributeData, dataframe);
        }
        if (this.isConstant()) {
            this.executor = undefined;
        } else if (this.canRunOnOneColumn()) {
            this.executor = generator.functionForAST(this.ast, { '*': 'value' });
        } else {
            const planNodeResult = generator.functionForPlanNode(
                this,
                dataframe.getColumnsByType()
            );
            this.isLocalized = planNodeResult.ast.isLocalized;
            this.executor = planNodeResult.executor;
        }
        this.eachNode(eachNode => {
            eachNode.compile(generator, dataframe);
        });
    },

    /**
     * @param {Dataframe} dataframe
     * @param {Boolean} valuesRequired
     * @param {String} iterationType
     * @returns {Mask|DataframeMask}
     */
    execute: function(dataframe, valuesRequired = false, iterationType = this.iterationType()) {
        if (iterationType !== this.iterationType()) {
            throw new Error(
                'Using an expression iterating over ' +
                    this.iterationType() +
                    ' within ' +
                    iterationType
            );
        }
        const numElements = dataframe.numByType(iterationType);
        let returnType = this.returnType(),
            resultValues;
        if (this.isConstant()) {
            // map constant values to the iteration types.
            // TODO: don't allocate all this (challenge is combining this return value with other arrays/masks).
            resultValues = new Array(numElements);
            const value = this.ast.value;
            // resultValues.fill(this.ast.value);
            for (let i = 0; i < numElements; i++) {
                resultValues[i] = value;
            }
            return resultValues;
        } else if (this.canRunOnOneColumn()) {
            const columnNames = this.identifierNodes();
            if (_.keys(columnNames).length != 1) {
                throw new Error({
                    msg: 'PlanNode.execute() expected exactly one attribute',
                    columnNames
                });
            }
            const identifier = _.keys(columnNames)[0];
            const { attribute } = dataframe.normalizeAttributeName(identifier);
            const attributeDataInstance = columnNames[identifier][0];
            const columnName = attributeDataInstance.attributeData[attribute];
            if (valuesRequired && returnType === ReturnTypes.Positions) {
                returnType = ReturnTypes.Values;
            }
            switch (returnType) {
                case ReturnTypes.Values: {
                    const columnValues = dataframe.getColumnValues(
                        columnName.attribute,
                        columnName.type
                    );
                    if (this.ast.type === 'Identifier') {
                        return columnValues;
                    } else {
                        return _.map(columnValues, this.executor);
                    }
                }
                case ReturnTypes.Positions:
                /* falls through */
                default:
                    return dataframe.getAttributeMask(
                        columnName.type,
                        columnName.attribute,
                        this.executor
                    );
            }
        } else {
            let attribute, bindings;
            if (this.isLocalized) {
                valuesRequired = _.any(
                    this.inputNodes,
                    inputNode => inputNode.returnType() === ReturnTypes.Values
                );
                bindings = _.mapObject(this.inputNodes, inputNode => {
                    if (_.isArray(inputNode)) {
                        return _.map(inputNode, eachNode =>
                            eachNode.execute(dataframe, valuesRequired, iterationType)
                        );
                    } else {
                        return inputNode.execute(dataframe, valuesRequired, iterationType);
                    }
                });
            } else {
                bindings = _.mapObject(this.attributeData, columnName =>
                    dataframe.getColumnValues(columnName.attribute, columnName.type)
                );
            }
            const bindingKeys = _.keys(bindings);
            const perElementBindings = _.mapObject(bindings, () => undefined);
            if (this.returnType() === ReturnTypes.Values) {
                resultValues = new Array(numElements);
                for (let i = 0; i < numElements; i++) {
                    for (let j = 0; j < bindingKeys.length; j++) {
                        attribute = bindingKeys[j];
                        perElementBindings[attribute] = bindings[attribute][i];
                    }
                    resultValues[i] = this.executor.call(perElementBindings);
                }
                return resultValues;
            } else {
                // TODO FIXME Terrible way to signal that we want to union/intersect/etc some set results:
                if (_.every(bindings, arg => arg instanceof DataframeMask)) {
                    return this.executor.call(bindings);
                }
                const mask = [];
                for (let i = 0; i < numElements; i++) {
                    for (let j = 0; j < bindingKeys.length; j++) {
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
    },

    iterationType: function() {
        let result;
        _.each(this.attributeData, attributeName => {
            if (result === undefined) {
                result = attributeName.type;
            }
        });
        return result || 'point';
    },

    eachAttribute: function(attributeIterator) {
        _.each(this.attributeData, (attributeName, key) => {
            attributeIterator(attributeName, key);
        });
    },

    eachNode: function(nodeIterator) {
        _.each(this.inputNodes, (eachNode, key) => {
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
    identifierNodes: function(result = {}) {
        if (this.ast.type === 'Identifier') {
            const identifierName = this.ast.name;
            if (identifierName === null || identifierName === undefined) {
                console.error({
                    msg: '== PlanNode.identifierNodes expected valid identifier node',
                    ast: this.ast
                });
                throw new Error({
                    msg: '== PlanNode.identifierNodes expected valid identifier node',
                    ast: this.ast
                });
            }
            if (result[identifierName] === undefined) {
                result[identifierName] = [];
            }
            result[identifierName].push(this);
        }
        this.eachNode(eachNode => {
            eachNode.identifierNodes(result);
        });
        return result;
    },

    /**
     * This recursively counts identifiers in the input nodes' ASTs.
     * @returns {number}
     */
    arity: function() {
        if (this.ast.type === 'Identifier') {
            return 1;
        }
        if (this.ast.type === 'Literal') {
            return 0;
        }
        const identifierNodes = this.identifierNodes();
        return _.size(identifierNodes);
    },

    isConstant: function() {
        return this.arity() === 0;
    },

    canRunOnOneColumn: function() {
        return this.arity() <= 1;
    },

    returnTypeOfAST: function(ast) {
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

    returnType: function() {
        return this.returnTypeOfAST(this.ast);
    }
};

/**
 * @param {Dataframe} dataframe
 * @param {ClientQueryAST} ast
 * @constructor
 */
function ExpressionPlan(dataframe, ast, guardNulls = true) {
    this.codeGenerator = new ExpressionCodeGenerator();
    /** @type PlanNode */
    this.rootNode = this.planFromAST(ast, dataframe, guardNulls);
    /** @type Dataframe */
    this.dataframe = dataframe;
    this.compile();
}

ExpressionPlan.prototype = {
    compile: function() {
        this.rootNode.compile(this.codeGenerator, this.dataframe);
    },

    isRedundant: function() {
        return this.rootNode.canRunOnOneColumn();
    },

    /**
     * @returns {Mask|DataframeMask}
     */
    execute: function() {
        return this.rootNode.execute(this.dataframe);
    },

    /**
     * @param {ClientQueryAST} ast - From expression parser.
     * @param {Dataframe} dataframe - Normalizes attributes.
     * @return {PlanNode}
     */
    planFromAST: function(ast, dataframe, guardNulls = true) {
        const inputProperties = this.codeGenerator.inputPropertiesFromAST(ast);
        if (inputProperties === undefined) {
            switch (ast.type) {
                case 'Identifier': {
                    const attributeData = {};
                    const attributeName = dataframe.normalizeAttributeName(ast.name);
                    if (attributeName !== undefined && attributeName !== null) {
                        attributeData[attributeName.attribute] = attributeName;
                    } else {
                        console.error({
                            exn: new Error(),
                            msg: 'planFromAST expected valid identifier',
                            ast: ast
                        });
                        throw new Error({ msg: 'planFromAST expected valid identifier', ast: ast });
                    }
                    return new PlanNode(ast, undefined, attributeData, guardNulls);
                }
                case 'Literal':
                    return new PlanNode(ast);
                default:
                    throw new Error('Unhandled input to plan: ' + ast.type);
            }
        } else {
            const inputResults = _.mapObject(_.pick(ast, inputProperties), inputAST => {
                if (_.isArray(inputAST)) {
                    return _.map(inputAST, eachAST =>
                        this.planFromAST(eachAST, dataframe, guardNulls)
                    );
                } else {
                    return this.planFromAST(inputAST, dataframe, guardNulls);
                }
            });
            return new PlanNode(ast, inputResults, undefined, guardNulls);
        }
    }
};

export default ExpressionPlan;

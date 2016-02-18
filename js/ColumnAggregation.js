'use strict';

var _ = require('underscore');
var dataTypeUtil = require('./dataTypes.js');

/**
 * @param {Dataframe} dataframe
 * @param {Object} column
 * @constructor
 */
function ColumnAggregation(dataframe, column) {
    this.dataframe = dataframe;
    this.column = column;
    /* @type Aggregations */
    this.aggregations = {
        count: undefined,
        countDistinct: undefined,
        distinctValues: undefined,
        maxValue: undefined,
        minValue: undefined,
        binning: undefined
    };
}

ColumnAggregation.prototype.updateAggregationTo = function (aggType, value) {
    this.aggregations[aggType] = value;
};

ColumnAggregation.prototype.updateAggregations = function (valuesByAggType) {
    _.extend(this.aggregations, valuesByAggType);
};

ColumnAggregation.prototype.hasAggregationByType = function (aggType) {
    return this.aggregations[aggType] !== undefined;
};

ColumnAggregation.prototype.getAggregationByType = function (aggType) {
    if (!this.hasAggregationByType(aggType)) {
        this.runAggregationForAggType(aggType);
    }
    return this.aggregations[aggType];
};

var AggTypes = [
    // Data type characterization:
    'jsType', 'dataType',
    'isNumeric', 'isIntegral', 'isContinuous', 'isQuantitative', 'isOrdered',
    'isDiverging', 'hasPositive', 'hasNegative', 'isPositive',
    // Computable in a single iteration pass:
    'count', 'countMissing', 'countValid', 'sum', 'minValue', 'maxValue', 'averageValue',
    // Computable only using data-aggregation:
    'countDistinct', 'distinctValues', 'isCategorical'
];

/**
 * @returns {Aggregations}
 */
ColumnAggregation.prototype.getSummary = function () {
    return _.object(AggTypes, _.map(AggTypes, function (aggType) {
        return this.getAggregationByType(aggType);
    }, this));
};

ColumnAggregation.prototype.runAggregationForAggType = function (aggType) {
    switch (aggType) {
        case 'jsType':
        case 'dataType':
        case 'isNumeric':
        case 'isIntegral':
        case 'isContinuous':
        case 'isQuantitative':
        case 'isOrdered':
            this.inferDataType();
            break;
        case 'isDiverging':
        case 'hasPositive':
        case 'hasNegative':
            this.inferDivergence();
            break;
        case 'count':
            this.aggregations.count = this.column.values.length;
            break;
        case 'minValue':
        case 'maxValue':
        case 'sum':
        case 'averageValue':
        case 'countMissing':
        case 'countValid':
            if (this.getAggregationByType('isNumeric')) {
                this.fixedAllocationNumericAggregations();
            } else {
                this.genericSinglePassFixedMemoryAggregations();
                this.updateAggregationTo('sum', null);
                this.updateAggregationTo('averageValue', null);
            }
            break;
        case 'standardDeviation':
            if (this.getAggregationByType('isNumeric')) {
                this.computeStandardDeviation();
            } else {
                this.updateAggregationTo('standardDeviation', null);
            }
            break;
        case 'countDistinct':
        case 'distinctValues':
        case 'isCategorical':
            this.countDistinct(500);
            break;
        case 'binning':
            break;
        default:
            throw new Error('Unrecognized aggregation type: ' + aggType);
    }
};

ColumnAggregation.prototype.isIntegral = function (value) {
    return parseInt(value) == value; // jshint ignore:line
};

ColumnAggregation.prototype.genericSinglePassFixedMemoryAggregations = function () {
    var minValue = null, maxValue = null, countMissing = 0,
        value, values = this.column.values, numValues = this.getAggregationByType('count');
    var isLessThan = dataTypeUtil.isLessThanForDataType(this.getAggregationByType('dataType'));
    for (var i=0; i < numValues; i++) {
        value = values[i];
        if (dataTypeUtil.valueSignifiesUndefined(value)) {
            countMissing++;
            continue;
        }
        if (minValue === null || isLessThan(value, minValue)) { minValue = value; }
        if (maxValue === null || isLessThan(maxValue, value)) { maxValue = value; }
    }
    this.updateAggregationTo('countValid', numValues - countMissing);
    this.updateAggregationTo('countMissing', countMissing);
    this.updateAggregationTo('minValue', minValue);
    this.updateAggregationTo('maxValue', maxValue);
};

ColumnAggregation.prototype.fixedAllocationNumericAggregations = function () {
    var minValue = Infinity, maxValue = -Infinity, sum = 0, countMissing = 0,
        value = 0, values = this.column.values, numValues = this.getAggregationByType('count');
    for (var i=0; i < numValues; i++) {
        value = values[i];
        if (dataTypeUtil.numberSignifiesUndefined(value)) {
            countMissing++;
            continue;
        }
        if (value < minValue) { minValue = value; }
        else if (value > maxValue) { maxValue = value; }
        sum += parseFloat(value);
    }
    this.updateAggregationTo('countValid', numValues - countMissing);
    this.updateAggregationTo('countMissing', countMissing);
    this.updateAggregationTo('minValue', minValue);
    this.updateAggregationTo('maxValue', maxValue);
    this.updateAggregationTo('sum', sum);
    this.updateAggregationTo('averageValue', sum / numValues);
};

ColumnAggregation.prototype.computeStandardDeviation = function () {
    var avg = this.getAggregationByType('averageValue'),
        value = 0, values = this.column.values, numValues = this.getAggregationByType('count'),
        sumSquareDiffs = 0, diff;
    for (var i=0; i < numValues; i++) {
        value = values[i];
        if (dataTypeUtil.numberSignifiesUndefined(value)) { continue; }
        diff = value - avg;
        sumSquareDiffs += diff * diff;
    }
    this.updateAggregationTo('standardDeviation', Math.sqrt(sumSquareDiffs / numValues));
};

var MaxDistinctValues = 400;

ColumnAggregation.prototype.countDistinct = function (limit) {
    var values = this.column.values;
    var numValues = this.getAggregationByType('count');
    if (limit === undefined) {
        limit = MaxDistinctValues;
    }
    var distinctCounts = {}, numDistinct = 0, minValue = Infinity, maxValue = -Infinity;
    for (var i = 0; i < numValues; i++) {
        var value = values[i];
        if (dataTypeUtil.valueSignifiesUndefined(value)) { continue; }
        if (value < minValue) { minValue = value; }
        else if (value > maxValue) { maxValue = value; }
        if (numDistinct < limit) {
            var key = value.toString();
            if (distinctCounts[key] === undefined) {
                numDistinct++;
                distinctCounts[key] = 1;
            } else {
                distinctCounts[key] += 1;
            }
        }
    }
    this.updateAggregationTo('countDistinct', numDistinct);
    this.updateAggregationTo('distinctValues', distinctCounts);
    var isCategorical = false;
    switch (this.getAggregationByType('dataType')) {
        case 'string':
            isCategorical = numDistinct <= limit;
            break;
        case 'integer':
            isCategorical = numDistinct <= limit &&
                (minValue === 0 || minValue === 1) && // allow [1..N+1]
                maxValue - minValue === numDistinct - 1; // dense integer range [0..N]
            break;
    }
    this.updateAggregationTo('isCategorical' , isCategorical);
};

var OrderedDataTypes = ['number', 'integer', 'string', 'date'];

ColumnAggregation.prototype.inferDataType = function () {
    var values = this.column.values;
    var numValues = this.getAggregationByType('count');
    var value, isNumeric = true, isIntegral = true, jsType;
    for (var i=0; i<numValues; i++) {
        value = values[i];
        if (dataTypeUtil.valueSignifiesUndefined(value)) { continue; }
        jsType = typeof value;
        if (isNumeric) {
            isNumeric = isNumeric && !isNaN(value);
            isIntegral = isNumeric && this.isIntegral(value);
        }
    }
    var summary = {
        jsType: jsType,
        isNumeric: isNumeric,
        isIntegral: isIntegral,
        isContinuous: isNumeric && !isIntegral
    };
    if (isIntegral) {
        summary.dataType = 'integer';
    } else if (isNumeric) {
        summary.dataType = 'number';
    } else {
        summary.dataType = 'string';
    }
    summary.isQuantitative = summary.isContinuous;
    summary.isOrdered = _.contains(OrderedDataTypes, summary.dataType);
    this.updateAggregations(summary);
};

ColumnAggregation.prototype.inferDivergence = function () {
    var isNumeric = this.getAggregationByType('isNumeric'),
        hasNegative = isNumeric && this.getAggregationByType('minValue') < 0,
        hasPositive = isNumeric && this.getAggregationByType('maxValue') > 0,
        summary = {
            hasPositive: hasPositive,
            hasNegative: hasNegative,
            isDiverging: hasNegative && hasPositive,
            isPositive: hasPositive && !hasNegative
        };
    this.updateAggregations(summary);
};


module.exports = ColumnAggregation;

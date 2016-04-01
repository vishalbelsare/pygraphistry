'use strict';

var _ = require('underscore');
var dataTypeUtil = require('./dataTypes.js');

/**
 * @param {Dataframe} dataframe
 * @param {Object} column
 * @param {String} attrName
 * @param {String} graphType
 * @constructor
 */
function ColumnAggregation(dataframe, column, attrName, graphType) {

    this.dataframe = dataframe;
    this.column = column;
    this.values = dataframe.getColumnValues(attrName, graphType);
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

/** Legible enumeration of all aggregations supported, for getSummary.
 */
var AggTypes = [
    // Data type characterization:
    'jsType', 'dataType',
    'isNumeric', 'isIntegral', 'isContinuous', 'isQuantitative', 'isOrdered',
    'isDiverging', 'hasPositive', 'hasNegative', 'isPositive',
    // Computable in a single iteration pass:
    'count', 'countMissing', 'countValid', 'sum', 'minValue', 'maxValue', 'averageValue',
    // Computable only using distinct value aggregation:
    'countDistinct', 'distinctValues', 'isCategorical',
    // Statistical:
    'variance', 'standardDeviation'
];

/** Maps external naming/abbreviations for aggregations to AggTypes values.
 * @type {Object.<String>}
 */
var AggAliases = {
    avg: 'averageValue',
    mean: 'averageValue',
    min: 'minValue',
    max: 'maxValue',
    std: 'standardDeviation',
    stddev: 'standardDeviation',
    stdev: 'standardDeviation',
    var: 'variance',
    distinct: 'countDistinct',
    valid: 'countValid',
    missing: 'countMissing'
};

ColumnAggregation.prototype.resolveAggregationType = function (aggType) {
    if (AggAliases.hasOwnProperty(aggType)) {
        return AggAliases[aggType];
    } else {
        return aggType;
    }
};

ColumnAggregation.prototype.isAggregationType = function (aggType) {
    return AggTypes.indexOf(aggType) !== -1;
};

ColumnAggregation.prototype.updateAggregationTo = function (aggType, value) {
    aggType = this.resolveAggregationType(aggType);
    if (this.isAggregationType(aggType)) {
        this.aggregations[aggType] = value;
    }
};

ColumnAggregation.prototype.updateAggregations = function (valuesByAggType) {
    _.each(valuesByAggType, function (aggValue, aggType) {
        this.updateAggregationTo(aggType, aggValue);
    }, this);
};

ColumnAggregation.prototype.hasAggregationByType = function (aggType) {
    return this.aggregations[this.resolveAggregationType(aggType)] !== undefined;
};

ColumnAggregation.prototype.getAggregationByType = function (aggType) {
    aggType = this.resolveAggregationType(aggType);
    if (!this.hasAggregationByType(aggType)) {
        this.runAggregationForAggType(aggType);
    }
    return this.aggregations[aggType];
};

/**
 * @returns {Aggregations}
 */
ColumnAggregation.prototype.getSummary = function () {
    var summary = {};
    _.each(AggTypes, function (aggType) {
        summary[aggType] = this.getAggregationByType(aggType);
    }, this);
    return summary;
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
            this.aggregations.count = this.values.length;
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
        case 'variance':
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
        numValues = this.getAggregationByType('count');
    var isLessThan = dataTypeUtil.isLessThanForDataType(this.getAggregationByType('dataType'));
    _.each(this.values, function (value) {
        if (dataTypeUtil.valueSignifiesUndefined(value)) {
            countMissing++;
            return;
        }
        if (minValue === null || isLessThan(value, minValue)) { minValue = value; }
        if (maxValue === null || isLessThan(maxValue, value)) { maxValue = value; }
    });
    this.updateAggregationTo('countValid', numValues - countMissing);
    this.updateAggregationTo('countMissing', countMissing);
    this.updateAggregationTo('minValue', minValue);
    this.updateAggregationTo('maxValue', maxValue);
};

ColumnAggregation.prototype.fixedAllocationNumericAggregations = function () {
    var minValue = Infinity, maxValue = -Infinity, sum = 0, countMissing = 0,
        numValues = this.getAggregationByType('count');
    _.each(this.values, function (value) {
        if (dataTypeUtil.numberSignifiesUndefined(value) || dataTypeUtil.int32SignifiesUndefined(value)) {
            countMissing++;
            return;
        }
        if (value < minValue) { minValue = value; }
        else if (value > maxValue) { maxValue = value; }
        sum += parseFloat(value);
    });
    this.updateAggregationTo('countValid', numValues - countMissing);
    this.updateAggregationTo('countMissing', countMissing);
    this.updateAggregationTo('minValue', minValue);
    this.updateAggregationTo('maxValue', maxValue);
    this.updateAggregationTo('sum', sum);
    this.updateAggregationTo('averageValue', sum / numValues);
};

ColumnAggregation.prototype.computeStandardDeviation = function () {
    var avg = this.getAggregationByType('averageValue'),
        numValues = this.getAggregationByType('count'),
        diff, sumSquareDiffs = 0;
    _.each(this.values, function (value) {
        if (dataTypeUtil.numberSignifiesUndefined(value)) { return; }
        diff = value - avg;
        sumSquareDiffs += diff * diff;
    });
    var variance = sumSquareDiffs / numValues;
    this.updateAggregationTo('variance', variance);
    this.updateAggregationTo('standardDeviation', Math.sqrt(variance));
};

var MaxDistinctValues = 400;

ColumnAggregation.prototype.countDistinct = function (limit) {
    if (limit === undefined) {
        limit = MaxDistinctValues;
    }
    var countsByValue = {}, numDistinct = 0, minValue = Infinity, maxValue = -Infinity,
        keyMaker = dataTypeUtil.keyMakerForDataType(this.getAggregationByType('dataType')), valueKey;
    _.each(this.values, function (value) {
        if (dataTypeUtil.valueSignifiesUndefined(value)) { return; }
        if (value < minValue) { minValue = value; }
        else if (value > maxValue) { maxValue = value; }
        valueKey = keyMaker(value);
        if (numDistinct < limit) {
            if (countsByValue[valueKey] === undefined) {
                numDistinct++;
                countsByValue[valueKey] = 1;
            } else {
                countsByValue[valueKey] += 1;
            }
        }
    });
    var distinctCounts = [];
    _.each(countsByValue, function (key, value) {
        return {distinctValue: key, count: value};
    });
    // Sort by count descending so the most common elements are first:
    distinctCounts.sort(function (a, b) { return b.count - a.count; });
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
    var isNumeric = true, isIntegral = true, jsType;
    _.each(this.values, function (value) {
        if (dataTypeUtil.valueSignifiesUndefined(value)) { return; }
        jsType = typeof value;
        if (isNumeric) {
            isNumeric = isNumeric && !isNaN(value);
            isIntegral = isNumeric && this.isIntegral(value);
        }
    }, this);
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

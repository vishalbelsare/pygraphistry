'use strict';

const _ = require('underscore');
import * as dataTypeUtil from './dataTypes.js';

/**
 * @typedef {Object} Aggregations
 * @property {String} dataType
 * @property {String} jsType
 * @property {Boolean} isNumeric
 * @property {Boolean} isIntegral
 * @property {Boolean} isContinuous
 * @property {Boolean} isCategorical
 * @property {Boolean} isQuantitative
 * @property {Boolean} isOrdered
 * @property {Boolean} isDiverging
 * @property {Boolean} hasPositive
 * @property {Boolean} hasNegative
 * @property {Boolean} isPositive Has positive values and no negative ones.
 * @property {Number} count
 * @property {Number} countDistinct
 * @property {ValueCount[]} distinctValues count of instances by value, sorted by count descending.
 * @property {Object} maxValue
 * @property {Object} minValue
 * @property {Number} standardDeviation
 * @property {Number} averageValue
 * @property {Number} sum
 * @property {Object} binning
 */

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
  this.attrName = attrName;
  this.graphType = graphType;
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
const AggTypes = [
  // Data type characterization:
  'jsType',
  'dataType',
  'isNumeric',
  'isIntegral',
  'isContinuous',
  'isQuantitative',
  'isOrdered',
  'isDiverging',
  'hasPositive',
  'hasNegative',
  'isPositive',
  // Computable in a single iteration pass:
  'count',
  'countMissing',
  'countValid',
  'sum',
  'minValue',
  'maxValue',
  'averageValue',
  // Computable only using distinct value aggregation:
  'countDistinct',
  'distinctValues',
  'isCategorical',
  // Statistical:
  'variance',
  'standardDeviation'
];

/** Maps external naming/abbreviations for aggregations to AggTypes values.
 * @type {Object.<String>}
 */
const AggAliases = {
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

ColumnAggregation.prototype.resolveAggregationType = function(aggType) {
  if (AggAliases.hasOwnProperty(aggType)) {
    return AggAliases[aggType];
  } else {
    return aggType;
  }
};

ColumnAggregation.prototype.isAggregationType = function(aggType) {
  return AggTypes.indexOf(aggType) !== -1;
};

ColumnAggregation.prototype.updateAggregationTo = function(aggType, value) {
  aggType = this.resolveAggregationType(aggType);
  if (this.isAggregationType(aggType)) {
    this.aggregations[aggType] = value;
  }
};

ColumnAggregation.prototype.updateAggregations = function(valuesByAggType) {
  _.each(valuesByAggType, (aggValue, aggType) => {
    this.updateAggregationTo(aggType, aggValue);
  });
};

ColumnAggregation.prototype.hasAggregationByType = function(aggType) {
  return this.aggregations[this.resolveAggregationType(aggType)] !== undefined;
};

ColumnAggregation.prototype.getAggregationByType = function(aggType) {
  aggType = this.resolveAggregationType(aggType);
  if (!this.hasAggregationByType(aggType)) {
    this.runAggregationForAggType(aggType);
  }
  return this.aggregations[aggType];
};

/**
 * @returns {Aggregations}
 */
ColumnAggregation.prototype.getSummary = function() {
  const summary = {};
  _.each(AggTypes, aggType => {
    summary[aggType] = this.getAggregationByType(aggType);
  });
  return summary;
};

ColumnAggregation.prototype.runAggregationForAggType = function(aggType) {
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
      this.countDistinct();
      break;
    case 'isCategorical':
      this.isCategorical();
      break;
    case 'median':
    case 'fullySorted':
      this.fullySorted();
      break;
    default:
      throw new Error('Unrecognized aggregation type: ' + aggType);
  }
};

ColumnAggregation.prototype.isIntegral = function(value) {
  return parseInt(value) == value; // jshint ignore:line
};

ColumnAggregation.prototype.genericSinglePassFixedMemoryAggregations = function() {
  const numValues = this.getAggregationByType('count');
  let minValue = null,
    maxValue = null,
    countMissing = 0;
  const isLessThan = dataTypeUtil.isLessThanForDataType(this.getAggregationByType('dataType'));
  _.each(this.values, value => {
    if (dataTypeUtil.valueSignifiesUndefined(value)) {
      countMissing++;
      return;
    }
    if (minValue === null || isLessThan(value, minValue)) {
      minValue = value;
    }
    if (maxValue === null || isLessThan(maxValue, value)) {
      maxValue = value;
    }
  });
  this.updateAggregationTo('countValid', numValues - countMissing);
  this.updateAggregationTo('countMissing', countMissing);
  this.updateAggregationTo('minValue', minValue);
  this.updateAggregationTo('maxValue', maxValue);
};

ColumnAggregation.prototype.fixedAllocationNumericAggregations = function() {
  const numValues = this.getAggregationByType('count');
  let minValue = Infinity,
    maxValue = -Infinity,
    sum = 0,
    countMissing = 0;
  _.each(this.values, value => {
    if (
      dataTypeUtil.numberSignifiesUndefined(value) ||
      dataTypeUtil.int32SignifiesUndefined(value)
    ) {
      countMissing++;
      return;
    }
    if (value < minValue) {
      minValue = value;
    }
    if (value > maxValue) {
      maxValue = value;
    }
    sum += parseFloat(value);
  });
  this.updateAggregationTo('countValid', numValues - countMissing);
  this.updateAggregationTo('countMissing', countMissing);
  this.updateAggregationTo('minValue', minValue);
  this.updateAggregationTo('maxValue', maxValue);
  this.updateAggregationTo('sum', sum);
  this.updateAggregationTo('averageValue', sum / numValues);
};

ColumnAggregation.prototype.computeStandardDeviation = function() {
  const avg = this.getAggregationByType('averageValue'),
    numValues = this.getAggregationByType('count');
  let diff,
    sumSquareDiffs = 0;
  _.each(this.values, value => {
    if (dataTypeUtil.numberSignifiesUndefined(value)) {
      return;
    }
    diff = value - avg;
    sumSquareDiffs += diff * diff;
  });
  const variance = sumSquareDiffs / numValues;
  this.updateAggregationTo('variance', variance);
  this.updateAggregationTo('standardDeviation', Math.sqrt(variance));
};

const MaxDistinctValues = 40000;

ColumnAggregation.prototype.fullySorted = function() {
  const dataType = this.getAggregationByType('dataType');
  const comparator = dataTypeUtil.comparatorForDataType(dataType);
  const numValues = this.getAggregationByType('count');
  if (comparator === undefined) {
    this.updateAggregationTo('fullySorted', null);
    return;
  }
  const sortedValues = _.clone(this.values);
  // The comparison call count here scales badly, but is offset by one-time simple allocation cost.
  // We could do better with a Schwartz Transform if each compare key has to be computed, but a calculated column
  // achieves that handily instead, so try to solve that at a higher level instead of fixing this.
  sortedValues.sort(comparator);
  this.updateAggregationTo('fullySorted', sortedValues);
  const halfwayIndex = Math.floor(numValues / 2);
  let medianValue = sortedValues[halfwayIndex];
  if (numValues % 2 === 0) {
    medianValue = (sortedValues[halfwayIndex - 1] + medianValue) / 2;
  }
  this.updateAggregationTo('median', medianValue);
};

ColumnAggregation.prototype.countDistinct = function(limit = MaxDistinctValues) {
  // TODO use an ES6 Map here.
  const countsByValue = {};
  let numDistinct = 0,
    minValue = null,
    maxValue = null;
  const dataType = this.getAggregationByType('dataType');
  const isLessThan = dataTypeUtil.isLessThanForDataType(dataType);
  const keyMaker = dataTypeUtil.keyMakerForDataType(dataType);
  _.each(this.values, value => {
    if (dataTypeUtil.valueSignifiesUndefined(value)) {
      return;
    }
    if (minValue === null || isLessThan(value, minValue)) {
      minValue = value;
    }
    if (maxValue === null || isLessThan(maxValue, value)) {
      maxValue = value;
    }
    const key = keyMaker(value);
    if (numDistinct < limit) {
      if (countsByValue.hasOwnProperty(key)) {
        countsByValue[key]++;
      } else {
        numDistinct++;
        countsByValue[key] = 1;
      }
    }
  });
  const distinctCounts = new Array(numDistinct);
  let idx = 0;
  _.each(countsByValue, (count, keyForValue) => {
    distinctCounts[idx++] = { distinctValue: keyForValue, count: count };
  });
  // Sort by count descending so the most common elements are first:
  distinctCounts.sort((a, b) => b.count - a.count);
  this.updateAggregationTo('minValue', minValue);
  this.updateAggregationTo('maxValue', maxValue);
  this.updateAggregationTo('countDistinct', numDistinct);
  this.updateAggregationTo('distinctValues', distinctCounts);
};

const MaxCategoricalValues = MaxDistinctValues;

ColumnAggregation.prototype.isCategorical = function(limit = MaxCategoricalValues) {
  const numDistinct = this.getAggregationByType('countDistinct'),
    minValue = this.getAggregationByType('minValue'),
    maxValue = this.getAggregationByType('maxValue');
  let isCategorical = false;
  switch (this.getAggregationByType('dataType')) {
    case 'string':
      isCategorical = numDistinct <= limit;
      break;
    case 'integer':
      isCategorical =
        numDistinct <= limit &&
        (minValue === 0 || minValue === 1) && // allow [1..N+1]
        maxValue - minValue === numDistinct - 1; // dense integer range [0..N]
      break;
  }
  this.updateAggregationTo('isCategorical', isCategorical);
};

const OrderedDataTypes = ['number', 'integer', 'string', 'date'];

ColumnAggregation.prototype.inferDataType = function() {
  let isNumeric = true,
    isIntegral = true,
    jsType;
  _.each(this.values, value => {
    if (dataTypeUtil.valueSignifiesUndefined(value)) {
      return;
    }
    jsType = typeof value;
    if (isNumeric) {
      isNumeric = isNumeric && !isNaN(value);
      isIntegral = isNumeric && this.isIntegral(value);
    }
  });
  const summary = {
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

ColumnAggregation.prototype.inferDivergence = function() {
  const isNumeric = this.getAggregationByType('isNumeric'),
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

export default ColumnAggregation;

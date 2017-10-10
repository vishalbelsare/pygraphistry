'use strict';

const Q = require('q');
const _ = require('underscore');
const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/Binning.js');

import * as dataTypeUtil from './dataTypes.js';

const maxBinCount = 30;

/**
 * @typedef {Object} BinDescription
 * @property {Object} min
 * @property {Object} max
 * @property {Object} representative
 * @property {Boolean} isSingular
 */

/**
 * @typedef {Object} Binning
 * @property {Number} numBins
 * @property {Number} binWidth
 * @property {Number} minValue
 * @property {Number} maxValue
 */

/**
 * @typedef {Binning} BinningResult
 * @property {String} type binning strategy of 'histogram' or 'countBy'
 * @property {Number} numValues
 * @property {Object} bins
 * @property {Object.<String, BinDescription>} binValues
 */

/**
 * @param {Dataframe} dataframe
 * @constructor
 */
function Binning(dataframe) {
  this.dataframe = dataframe;
}

/**
 * @param {ColumnName} columnName
 * @param {Binning} binningHint
 * @param {Number} goalNumberOfBins
 * @param {DataframeMask} mask
 * @param {String?} dataType
 * @returns {BinningResult}
 */
Binning.prototype.binningForColumn = function(
  columnName,
  binningHint = undefined,
  goalNumberOfBins = 0,
  mask = this.dataframe.newEmptyMask(),
  dataType = undefined
) {
  const { attribute, type } = columnName;
  const values = this.dataframe.getColumnValues(attribute, type, true);
  const aggregations = this.dataframe.getColumnAggregations(attribute, type, true);

  const numValues = aggregations.getAggregationByType('countDistinct');
  if (numValues === 0) {
    return Q({ type: 'nodata' });
  }

  // Override if provided binning data.
  if (binningHint === undefined) {
    binningHint = this.calculateBinning(aggregations, numValues, goalNumberOfBins);
  }
  let { numBins, binWidth, minValue, maxValue } = binningHint;
  let bottomVal = minValue;
  let topVal = maxValue;

  // Guard against 0 width case
  if (maxValue === minValue) {
    binWidth = 1;
    numBins = 1;
    topVal = minValue + 1;
    bottomVal = minValue;
  }

  // const qDataBuffer = this.dataframe.getBuffer(attribute, type);
  // const binStart = new Float32Array(numBins);
  // for (let i = 0; i < numBins; i++) {
  //     binStart[i] = bottomVal + (binWidth * i);
  // }

  // const dataSize = maskForType.length;

  const result = {
    type: binningHint.isCountBy ? 'countBy' : 'histogram',
    dataType: dataType,
    numBins: numBins,
    binWidth: binWidth,
    numValues: numValues,
    maxValue: topVal,
    minValue: bottomVal
  };

  let bins, binValues;

  // Fast path for case of only one bin.
  if (numBins === 1) {
    bins = [numValues];
    if (binningHint.isCountBy) {
      binValues = [{ min: minValue, max: minValue, representative: minValue, isSingular: true }];
    }
    _.extend(result, { bins: bins, binValues: binValues });
    return Q(result);
  }

  // return qDataBuffer.then((dataBuffer) => {
  //     return simulator.otherKernels.histogramKernel.run(simulator, numBins, dataSize, dataBuffer, maskForType, binStart);
  // }).then((bins) => {
  //     return _.extend(result, {bins: bins});
  // }).fail(log.makeQErrorHandler(logger, 'Failure trying to run histogramKernel'));

  // Dead code, exists solely for timing.
  // TODO: Make this a config option.

  bins = Array.apply(null, new Array(numBins)).map(Number.prototype.valueOf, 0);
  binValues = new Array(numBins);

  // When iterating through values, we make sure to use the full value array and an
  // maskForType "mask" over it. This is because each histogram brush move produces a single
  // new (large) array of maskForType. Then each separate histogram can use the already existing
  // values array and the single maskForType array to compute bins without any large allocations.
  const isLessThan = dataTypeUtil.isLessThanForDataType(
    aggregations.getAggregationByType('dataType')
  );
  mask.forEachIndexByType(type, i => {
    // Here we use an optimized "Floor" because we know it's a smallish, positive number.
    // TODO: Have to be careful because floating point error.
    // In particular, we need to match math as closely as possible in expressions.
    const value = values[i];
    if (dataTypeUtil.valueSignifiesUndefined(value)) {
      return;
    }
    let binId;
    if (_.isNumber(value)) {
      binId = ((value - bottomVal) / binWidth) | 0;
    } else {
      // Least greater-than:
      binId = _.findIndex(binValues, binValue => isLessThan(value, binValue));
      if (binId === -1) {
        binId = 0;
      }
      binId |= 0;
    }
    if (binId > 1e6) {
      // binValues.length is sometimes exceeded for unclear reasons.
      logger.warn(
        'Invalid bin ID: ' + binId.toString() + ' generated for value: ' + JSON.stringify(value)
      );
      return;
    }
    bins[binId]++;
    if (binValues[binId] === undefined) {
      binValues[binId] = { min: value, max: value, representative: value, isSingular: true };
    }
    const binDescription = binValues[binId];
    if (binDescription.representative !== value) {
      binDescription.isSingular = false;
    }
    if (isLessThan(value, binDescription.min)) {
      binDescription.min = value;
    }
    if (isLessThan(binDescription.max, value)) {
      binDescription.max = value;
    }
  });

  _.extend(result, { bins: bins, binValues: binValues });
  return Q(result);
};

/**
 * @param {ColumnName} columnName
 * @param {DataframeMask} mask
 * @param {String} dataType
 * @returns {BinningResult}
 */
Binning.prototype.binningForColumnByDistinctValue = function(columnName, mask, dataType) {
  const type = columnName.type;
  if (mask.isEmptyByType(type)) {
    return Q({ type: 'nodata' });
  }

  const values = this.dataframe.getColumnValues(columnName.attribute, type, true);

  // TODO: Get this value from a proper source, instead of hard coding.
  const maxNumBins = 29;

  const countsByValue = {};
  const countValue = function(val) {
    if (dataTypeUtil.valueSignifiesUndefined(val)) {
      return;
    }
    countsByValue[val] = (countsByValue[val] || 0) + 1;
  };
  const maskForType = mask.getMaskForType(type);
  if (maskForType === undefined) {
    _.each(values, countValue);
  } else {
    _.each(maskForType, selectedIndex => {
      countValue(values[selectedIndex]);
    });
  }

  const numBins = Math.min(_.keys(countsByValue).length, maxNumBins);
  const numBinsWithoutOther = numBins - 1;
  const keys = _.keys(countsByValue);
  const sortedKeys =
    dataType === 'number'
      ? keys.sort((a, b) => a - b)
      : keys.sort((a, b) => countsByValue[b] - countsByValue[a]);

  // Copy over numBinsWithoutOther from countsByValue to bins directly.
  // Take the rest and bucket them into '_other'
  const bins = {};
  let binValues;
  _.each(sortedKeys.slice(0, numBinsWithoutOther), key => {
    bins[key] = countsByValue[key];
  });

  const otherKeys = sortedKeys.slice(numBinsWithoutOther);
  if (otherKeys.length === 1) {
    bins[otherKeys[0]] = countsByValue[otherKeys[0]];
  } else if (otherKeys.length > 1) {
    // TODO ensure that this _other bin can be selected and it turn into a correct AST query.
    const sumInOther = _.reduce(otherKeys, (memo, key) => memo + countsByValue[key], 0);
    bins._other = sumInOther;
    binValues = { _other: { representative: '_other', numValues: otherKeys.length } };
  }

  const numValues = _.reduce(_.values(bins), (memo, num) => memo + num, 0);

  return Q({
    type: 'countBy',
    dataType: dataType,
    numValues: numValues,
    numBins: _.keys(bins).length,
    bins: bins,
    binValues: binValues,
    valueToBin: _.object(sortedKeys.map((key, i) => [key, i]))
  });
};

/**
 * @param {ColumnAggregation} aggregations
 * @param {Number} numValues
 * @param {Number} goalNumberOfBins
 * @returns {Binning} a binning object
 */
Binning.prototype.calculateBinning = function(aggregations, numValues, goalNumberOfBins) {
  let goalBins =
    numValues > maxBinCount
      ? Math.ceil(Math.log(numValues) / Math.log(2)) + 1
      : Math.ceil(Math.sqrt(numValues));
  goalBins = Math.min(goalBins, maxBinCount); // Cap number of bins.
  goalBins = Math.max(goalBins, 8); // Cap min number of bins.

  const max = aggregations.getAggregationByType('maxValue');
  const min = aggregations.getAggregationByType('minValue');

  const defaultBinning = {
    numBins: 1,
    binWidth: 1,
    minValue: -Infinity,
    maxValue: Infinity
  };

  let numBins;
  let bottomVal;
  let topVal;
  let binWidth;
  const range = max - min;
  let isCountBy;
  const countDistinct = aggregations.getAggregationByType('countDistinct');
  if (isNaN(range) || min === false) {
    // Implies non-numerical domain. Boolean needs special logic, har.
    numBins = Math.min(countDistinct, maxBinCount);
    bottomVal = min;
    topVal = max;
    isCountBy = countDistinct <= numBins;
  } else if (countDistinct < maxBinCount && aggregations.getAggregationByType('isIntegral')) {
    numBins = numValues;
    bottomVal = min;
    topVal = max;
    binWidth = range / Math.max(numBins - 1, 1);
    isCountBy = range <= maxBinCount;
  } else if (goalNumberOfBins) {
    numBins = goalNumberOfBins;
    bottomVal = min;
    topVal = max;
    binWidth = range / (goalNumberOfBins - 1);

    // Try to find a good division.
  } else {
    // const goalWidth = range / goalBins;

    binWidth = 10;
    numBins = range / binWidth;

    // Edge case for invalid values
    // Should capture general case of NaNs and other invalid
    if (min === Infinity || max === -Infinity || numBins < 0) {
      return defaultBinning;
    }

    // Get to a rough approx
    while (numBins < 2 || numBins >= 100) {
      if (numBins < 2) {
        binWidth *= 0.1;
      } else {
        binWidth *= 10;
      }
      numBins = range / binWidth;
    }

    // Refine by doubling/halving
    const minBins = Math.max(3, Math.floor(goalBins / 2) - 1);
    while (numBins < minBins || numBins > goalBins) {
      if (numBins < minBins) {
        binWidth /= 2;
      } else {
        binWidth *= 2;
      }
      numBins = range / binWidth;
    }

    bottomVal = dataTypeUtil.roundDownBy(min, binWidth);
    topVal = dataTypeUtil.roundUpBy(max, binWidth);
    numBins = Math.floor((topVal - bottomVal) / binWidth) + 1;
  }

  // console.log('NUM BINS: ', numBins);
  // console.log('max: ', max, 'min: ', min, 'goalBins: ', goalBins);

  return {
    numBins: numBins,
    binWidth: binWidth,
    isCountBy: isCountBy,
    minValue: bottomVal,
    maxValue: topVal
  };
};

// Counts occurrences of type that matches type of time attr.
Binning.prototype.timeBasedHistogram = function(
  mask,
  timeType,
  timeAttr,
  start,
  stop,
  timeAggregation
) {
  // Compute binning
  const startDate = new Date(start);
  const endDate = new Date(stop);

  //////////////////////////////////////////////////////////////////////////
  // COMPUTE INC / DEC FUNCTIONS
  //////////////////////////////////////////////////////////////////////////

  const { inc: incFunction, dec: decFunction } = dataTypeUtil.dateIncrementors(timeAggregation);
  if (incFunction === undefined) {
    return;
  }

  //////////////////////////////////////////////////////////////////////////
  // Optionally set start / stop to nice boundaries
  //////////////////////////////////////////////////////////////////////////

  // // Make sure startDate is on a nice boundary
  // decFunction(startDate);

  // // Before incrementing endDate, check to see if it's already a boundary (in which case we don't)
  // // want to increment
  // const testDate = new Date(endDate.getTime());
  // decFunction(testDate);
  // if (testDate.getTime() !== endDate.getTime()) {
  //     incFunction(endDate);
  // }

  //////////////////////////////////////////////////////////////////////////
  // Compute cutoffs
  //////////////////////////////////////////////////////////////////////////

  // TODO: We don't strictly need to compute all cutoffs to bin.
  // We should just compute numBins, width, start, stop like in normal histograms
  const cutoffs = [startDate];

  // Guess how many it would be.
  const timeA = new Date(start);
  const timeB = new Date(start);
  decFunction(timeA);
  incFunction(timeB);
  let binWidth = timeB.getTime() - timeA.getTime();

  const estimatedNumberBins = (endDate.getTime() - startDate.getTime()) / binWidth;
  const MAX_BINS_TIME_HISTOGRAM = 2500;

  let approximated = false;
  if (estimatedNumberBins > MAX_BINS_TIME_HISTOGRAM) {
    const diff = endDate.getTime() - startDate.getTime();
    const startNum = startDate.getTime();
    const step = Math.floor(diff / MAX_BINS_TIME_HISTOGRAM);
    let runningDate = startNum + step;
    while (runningDate < endDate) {
      const newDate = new Date(runningDate);
      cutoffs.push(newDate);
      runningDate += step;
    }
    approximated = true;
  } else {
    let runningDate = startDate;
    let backupCount = 0;
    while (runningDate < endDate && backupCount < 100000) {
      const newDate = new Date(runningDate.getTime());
      incFunction(newDate);
      if (newDate < endDate) {
        cutoffs.push(newDate);
      }
      runningDate = newDate;
      backupCount++;
    }
  }

  cutoffs.push(endDate);
  const cutoffNumbers = cutoffs.map((val /*, i*/) => {
    return val.getTime();
  });

  //////////////////////////////////////////////////////////////////////////
  // Compute bins given cutoffs
  //////////////////////////////////////////////////////////////////////////

  // Fill bins
  const numBins = cutoffs.length - 1;
  const bins = Array.apply(null, new Array(numBins)).map(() => 0);
  // This is getting filtered values intentionally [or not?]
  const timeValues = this.dataframe.getColumnValues(timeAttr, timeType);

  // COMPUTE BIN WIDTH
  const binWidthTestDate = new Date(start);
  decFunction(binWidthTestDate);
  const bottom = binWidthTestDate.getTime();
  incFunction(binWidthTestDate);
  const top = binWidthTestDate.getTime();

  // If we have more than 3 bins, we can just take a difference from the middle
  if (cutoffNumbers.length > 3) {
    binWidth = cutoffNumbers[2] - cutoffNumbers[1];
  } else {
    binWidth = top - bottom;
  }

  mask.forEachIndexByType(timeType, idx => {
    const value = timeValues[idx];
    const valueDate = new Date(value);
    const valueNum = valueDate.getTime();

    // Because the first and last bins can be variable width (but ONLY those)
    // We need to special case being in the first bucket, and make rest of computations
    // against the second cutoff number and inc by one

    // In bin one
    if (valueNum < cutoffNumbers[1]) {
      bins[0]++;
    } else {
      // In any other bin
      const binId = (((valueNum - cutoffNumbers[1]) / binWidth) | 0) + 1;
      bins[binId]++;
    }

    // const binId = ((valueNum - cutoffNumbers[0]) / binWidth) | 0;
    // bins[binId]++;
  });

  //////////////////////////////////////////////////////////////////////////
  // Compute offsets array for visualization purposes
  //////////////////////////////////////////////////////////////////////////

  const widths = [];
  for (let i = 0; i < cutoffNumbers.length - 1; i++) {
    widths[i] = (cutoffNumbers[i + 1] - cutoffNumbers[i]) / binWidth;
  }

  const rawOffsets = [];
  // Compute scan of widths
  for (let i = 0; i < widths.length; i++) {
    const prev = i > 0 ? rawOffsets[i - 1] : 0;
    rawOffsets[i] = prev + widths[i];
  }

  // Normalize rawOffsets so that they are out of 1.0;
  const denom = rawOffsets[rawOffsets.length - 1];
  const offsets = [];
  for (let i = 0; i < rawOffsets.length; i++) {
    const raw = i > 0 ? rawOffsets[i - 1] : 0;
    offsets[i] = raw / denom;
  }

  //////////////////////////////////////////////////////////////////////////
  // Provide keys for d3
  //////////////////////////////////////////////////////////////////////////

  const keys = _.map(cutoffs, d => {
    const newDate = new Date(d.getTime());
    decFunction(newDate);
    return timeAggregation + newDate.getTime();
  });

  return {
    bins: bins,
    maxBin: _.max(bins),
    numBins: numBins,
    step: binWidth,
    attr: timeAttr,
    type: timeType,
    start: cutoffNumbers[cutoffNumbers.length - 1],
    topVal: cutoffNumbers[cutoffNumbers.length - 1],
    stop: cutoffNumbers[0],
    bottomVal: cutoffNumbers[0],
    timeAggregation: timeAggregation,
    cutoffs: cutoffNumbers,
    approximated: approximated,
    offsets: offsets,
    widths: widths,
    keys: keys
  };
};

/**
 * @param {DataframeMask} mask
 * @param {String[]} attributes - undefined lets server fill in
 * @param {Object.<Binning>} binningHintsByAttribute
 * @param {String?} mode
 * @param {GraphComponentTypes} type - undefined type signifies both nodes and edges
 * @param {Number?} goalNumberOfBins
 * @returns {Promise.<Object.<BinningResult>>}
 */
Binning.prototype.computeBinningByColumnNames = function(
  mask,
  attributes,
  binningHintsByAttribute = {},
  mode = undefined,
  type = undefined,
  goalNumberOfBins = 0
) {
  /** @param {String} attribute
     * @returns {BinningResult}
     */
  const binColumn = attribute => {
    const binningHint = binningHintsByAttribute[attribute];
    const dataType = this.dataframe.getDataType(attribute, type);
    const columnName = { attribute, type };
    const aggregations = this.dataframe.getColumnAggregations(attribute, type, true);
    const countDistinct = aggregations.getAggregationByType('countDistinct');
    const isCountBy = countDistinct < maxBinCount;

    if (mode === 'countBy' || isCountBy || dataType === 'string') {
      return this.binningForColumnByDistinctValue(columnName, mask, dataType);
    } else {
      return this.binningForColumn(columnName, binningHint, goalNumberOfBins, mask, dataType);
    }
  };

  let keysForBinning = attributes || this.getAttributeKeys(type);

  // Make sure that valid attributes were passed in.
  keysForBinning = keysForBinning.filter(columnName =>
    this.dataframe.hasColumnNamed(type, columnName)
  );

  let chain = Q(); // simulator.otherKernels.histogramKernel.setIndices(simulator, maskForType);
  /** @type Object.<BinningResult> */
  const binningByColumnName = {};

  _.each(keysForBinning, attribute => {
    chain = chain.then(() =>
      binColumn(attribute).then(agg => {
        // Store result
        binningByColumnName[type + ':' + attribute] = agg;

        // Force loop restart before handling next
        // So async IO can go through, e.g., VBO updates
        const waitForNextTick = Q.defer();
        process.nextTick(() => {
          waitForNextTick.resolve();
        });
        return waitForNextTick.promise;
      })
    );
  });

  return chain.then(() => binningByColumnName);

  // Array of promises
  // const promisedBinnings = _.map(keysForBinning, (attribute) => {
  //     return binColumn(attribute, maskForType);
  // });

  // return Q.all(promisedBinnings).then((aggregated) => {
  //     const ret = {};
  //     _.each(aggregated, (agg, idx) => {
  //         ret[keysForBinning[idx]] = agg;
  //     });
  //     return ret;
  // });
};

/**
 * @param {Dataframe} dataframe
 * @param {Number?} maxInitialItems
 * @returns {ColumnName[]}
 */
Binning.prototype.selectInitialColumnsForBinning = function(maxInitialItems = undefined) {
  const scoredColumnNames = [];
  const attributeKeysByType = _.object(
    _.map(['point', 'edge'], type => [type, this.dataframe.getAttributeKeys(type)])
  );
  const CommonAttributeNamesSortedByInterestLevel = this.dataframe
    .CommonAttributeNamesSortedByInterestLevel;
  const scoreRange = CommonAttributeNamesSortedByInterestLevel.length;
  _.each(attributeKeysByType, (attributeKeys, type) => {
    _.each(attributeKeys, attributeName => {
      const column = this.dataframe.getColumn(attributeName, type);
      const aggregations = this.dataframe.getColumnAggregations(attributeName, type, true);
      const countDistinct = aggregations.getAggregationByType('countDistinct');
      const fractionValid =
        aggregations.getAggregationByType('countValid') /
        aggregations.getAggregationByType('count');
      let score = 0; // Lower is better.
      // Develop a score for prioritizing the columns.
      if (this.dataframe.isAttributeNamePrivate(attributeName)) {
        // Avoid private columns if at all possible (usually just an internal target of an alias).
        score += scoreRange;
      }
      if (fractionValid < 0.01) {
        score += scoreRange;
      }
      // Prioritize user-provided data ahead of system data.
      let sysIndex = CommonAttributeNamesSortedByInterestLevel.indexOf(attributeName);
      // Double check whether this is an alias for system data.
      if (sysIndex === -1 && column.name !== attributeName) {
        sysIndex = CommonAttributeNamesSortedByInterestLevel.indexOf(column.name);
      }
      if (sysIndex === -1) {
        // Prioritize user-provided data (crudely) by how small the _other bin is;
        // mega-valued domains make poor histograms.
        if (countDistinct < 2) {
          score += scoreRange;
        } else {
          score -= scoreRange / Math.log(countDistinct);
        }
      } else {
        score += sysIndex;
      }
      scoredColumnNames.push({
        type: type,
        score: score,
        dataType: column.type,
        attribute: attributeName
      });
    });
  });
  const sortedColumnNames = _.sortBy(scoredColumnNames, columnName => columnName.score);
  return _.first(sortedColumnNames, maxInitialItems);
};

export default Binning;

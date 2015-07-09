'use strict';

var _ = require('underscore');
var dateFormat = require('dateformat');
var fs = require('fs');

var baseDirPath = __dirname + '/../assets/dataframe/';
var TYPES = ['point', 'edge', 'simulator'];

var Dataframe = function () {
    // We keep a copy of the original data, plus a filtered view
    // that defaults to the new raw data.
    //
    // This is to allow tools like filters/selections to propagate to
    // all other tools that rely on data frames.

    this.rawdata = {
        attributes: {
            point: {},
            edge: {}
        },
        buffers: {
            point: {},
            edge: {},
            simulator: {}
        },
        labels: {

        },
        // TODO: Can we deal with this more naturally?
        hostBuffers: {

        },
        localBuffers: {

        },
        rendererBuffers: {

        },
        graphData: {

        },
        numElements: {}
    };
    this.data = this.rawdata;
};


//////////////////////////////////////////////////////////////////////////////
// Data Loading
//////////////////////////////////////////////////////////////////////////////

/**
 * TODO: Implicit degrees for points and src/dst for edges.
 * @param {Object} attributes
 * @param {string} type - any of [TYPES]{@link TYPES}
 */
Dataframe.prototype.load = function (attributes, type) {

    // Case of loading with no data.
    if (_.keys(attributes).length === 0) {
        return;
    }

    // TODO: Decoding at the presentation layer.
    // decodeStrings(attributes);
    // decodeDates(attributes);

    var nodeTitleField = getNodeTitleField(attributes);
    var edgeTitleField = getEdgeTitleField(attributes);

    var filteredKeys = _.keys(attributes)
        .filter(function (name) {
            return ['pointColor', 'pointSize', 'pointTitle', 'pointLabel',
                    'edgeLabel', 'edgeTitle', 'degree'].indexOf(name) === -1;
        })
        .filter(function (name) { return name !== nodeTitleField && name !== edgeTitleField; });

    var filteredAttributes = _.pick(attributes, function (value, key) {
        return filteredKeys.indexOf(key) > -1;
    });

    // Case of filtering out all attributes
    if (filteredKeys.length === 0) {
        return;
    }


    var numElements = filteredAttributes[filteredKeys[0]].values.length;
    this.rawdata.numElements[type] = numElements;

    if (nodeTitleField) {
        filteredAttributes._title = attributes[nodeTitleField];
    } else if (edgeTitleField) {
        filteredAttributes._title = attributes[edgeTitleField];
    } else {
        filteredAttributes._title = {type: 'number', values: range(numElements)};
    }

    _.extend(this.rawdata.attributes[type], filteredAttributes);
    // TODO: Case where data != raw data.
};


/** Load in degrees as a universal (independent of datasource) value
 * @param {Typed Array} outDegrees - degrees going out of nodes
 * @param {Typed Array} inDegrees - degrees going into nodes
 */
Dataframe.prototype.loadDegrees = function (outDegrees, inDegrees) {
    var numElements = this.rawdata.numElements['point'];
    var attributes = this.rawdata.attributes['point'];

    // TODO: Error handling
    if (numElements !== outDegrees.length || numElements !== inDegrees.length) {
        return;
    }

    var degree = new Array(numElements);
    var degree_in = new Array(numElements);
    var degree_out = new Array(numElements);

    for (var i = 0; i < numElements; i++) {
        degree_in[i] = inDegrees[i];
        degree_out[i] = outDegrees[i];
        degree[i] = inDegrees[i] + outDegrees[i];
    }

    attributes.degree = {values: degree};
    attributes.degree_in = {values: degree_in};
    attributes.degree_out = {values: degree_out};
};


/** Load in edge source/dsts as a universal (independent of datasource) value
 * @param {Typed Array} unsortedEdges - usorted list of edges.
 */
Dataframe.prototype.loadEdgeDestinations = function (unsortedEdges) {
    var numElements = this.rawdata.numElements['edge'] || unsortedEdges.length / 2;
    var attributes = this.rawdata.attributes['edge'];
    var nodeTitles = this.rawdata.attributes['point']._title.values;

    var source = new Array(numElements);
    var destination = new Array(numElements);

    for (var i = 0; i < numElements; i++) {
        source[i] = nodeTitles[unsortedEdges[2*i]]
        destination[i] = nodeTitles[unsortedEdges[2*i + 1]];
    }

    attributes.Source = {values: source};
    attributes.Destination = {values: destination};

    // If no attributes for edges have ever been loaded, just make title the index.
    // TODO: Deal with this more elegantly / elsewhere
    if (!this.rawdata.numElements['edge']) {
        this.rawdata.numElements['edge'] = numElements;
        attributes._title = {type: 'number', values: range(numElements)};
    }

};


/** Load in a raw OpenCL buffer object.
 *  @param {string} name - name of the buffer
 *  @param {string} type - any of [TYPES]{@link TYPES}.
 *  @param {Object} buffer - a raw OpenCL buffer object
 */
Dataframe.prototype.loadBuffer = function (name, type, buffer) {
    var buffers = this.rawdata.buffers[type];
    buffers[name] = buffer;
};


Dataframe.prototype.writeBuffer = function (name, type, values) {
    var buffer = this.rawdata.buffers[type][name];
    return buffer.write(values);
};


/** Load in a host buffer object.
 *  @param {string} name - name of the buffer
 *  @param {Object} buffer - a raw OpenCL buffer object
 */
Dataframe.prototype.loadHostBuffer = function (name, buffer) {
    var hostBuffers = this.rawdata.hostBuffers;
    hostBuffers[name] = buffer;
};


Dataframe.prototype.loadLocalBuffer = function (name, buffer) {
    var localBuffers = this.rawdata.localBuffers;
    localBuffers[name] = buffer;
};


Dataframe.prototype.setLocalBufferValue = function (name, idx, value) {
    var localBuffers = this.rawdata.localBuffers;
    localBuffers[name][idx] = value;
};


Dataframe.prototype.loadRendererBuffer = function (name, buffer) {
    var rendererBuffers = this.rawdata.rendererBuffers;
    rendererBuffers[name] = buffer;
};


Dataframe.prototype.setHostBufferValue = function (name, idx, value) {
    var hostBuffers = this.rawdata.hostBuffers;
    hostBuffers[name][idx] = value;
};


Dataframe.prototype.loadGraphData = function (name, edges) {
    this.rawdata.graphData[name] = edges;
};


Dataframe.prototype.loadLabels = function (type, labels) {
    this.rawdata.labels[type] = labels;
};


Dataframe.prototype.deleteBuffer = function (name) {
    var that = this;
    _.each(TYPES, function (type) {
        _.each(_.keys(that.rawdata.buffers[type]), function (key) {
            if (key === name) {
                that.rawdata.buffers[type][key].delete();
                that.rawdata.buffers[type][key] = null;
            }
        });
    });
};

Dataframe.prototype.setNumElements = function (type, num) {
    this.rawdata.numElements[type] = num;
};


//////////////////////////////////////////////////////////////////////////////
// Data Access
//////////////////////////////////////////////////////////////////////////////

Dataframe.prototype.getBufferKeys = function (type) {
    return _.sortBy(
        _.keys(this.data.buffers[type]),
        _.identity
    );
};

Dataframe.prototype.getNumElements = function (type) {
    var res = this.data.numElements[type];
    if (!res && res !== 0) {
        throw "Invalid Num Elements: " + type;
    }
    return res;
};


Dataframe.prototype.getLocalBuffer = function (name) {
    var res = this.data.localBuffers[name];
    if (!res) {
        throw "Invalid Local Buffer: " + name;
    }
    return res;
};

Dataframe.prototype.getHostBuffer = function (name) {
    var res = this.data.hostBuffers[name];
    if (!res) {
        throw "Invalid Host Buffer: " + name;
    }
    return res;
};

Dataframe.prototype.getLabels = function (type) {
    return this.data.labels[type];
};


/** Returns an OpenCL buffer object.
 *  @param {string} name - name of the buffer
 *  @param {string} type - any of [TYPES]{@link TYPES}.
 */
Dataframe.prototype.getBuffer = function (name, type) {
    var buffers = this.data.buffers[type];
    var res = buffers[name];
    if (!res) {
        throw "Invalid Buffer[" + type + "]: " + name;
    }
    return res;
};


/** Returns one row object.
 * @param {double} index - which element to extract.
 * @param {string} type - any of [TYPES]{@link TYPES}.
 * @param {Object?} attributes - which attributes to extract from the row.
 */
Dataframe.prototype.getRowAt = function (index, type, attributes) {
    attributes = attributes || this.data.attributes[type];
    var row = {};
    _.each(_.keys(attributes), function (key) {
        row[key] = attributes[key].values[index];
    });
    return row;
};


/** Returns array of row (fat json) objects.
 * @param {Array.<number>} indices - which elements to extract.
 * @param {string} type - any of [TYPES]{@link TYPES}.
 */
Dataframe.prototype.getRows = function (indices, type) {
    var attributes = this.data.attributes[type],
        that = this;

    indices = indices || range(that.data.numElements[type]);

    return _.map(indices, function (index) {
        return that.getRowAt(index, type, attributes);
    });
};


/** Returns a descriptor of a set of rows.
 * @param {Array.<number>} indices - which elements to extract.
 * @param {string} type - any of [TYPES]{@link TYPES}.
 * @returns {{header, values}}
 */
Dataframe.prototype.getRowsCompact = function (indices, type) {
    var attributes = this.data.attributes[type],
        keys = this.getAttributeKeys(type);

    indices = indices || range(that.data.numElements[type]);

    var values = _.map(indices, function (index) {
        var row = [];
        _.each(keys, function (key) {
            row.push(attributes[key].values[index]);
        });
        return row;
    });

    return {
        header: keys,
        values: values
    };
};

Dataframe.prototype.getColumn = function (column, type) {
    var attributes = this.data.attributes[type];
    return attributes[column].values;
};


Dataframe.prototype.getAttributeKeys = function (type) {
    return _.sortBy(
        _.keys(this.data.attributes[type]),
        _.identity
    );
};


//////////////////////////////////////////////////////////////////////////////
// Data Serialization
//////////////////////////////////////////////////////////////////////////////

/** Serialize the dataframe to the target in JSON format in row-wise order.
 * @param {string} target - filename to write to.
 * @param {Object} options - has flags 'compact' and 'compress'
 */
Dataframe.prototype.serializeRows = function (target, options) {
    // TODO: Async file write.
    options = options || {};
    var that = this;
    var toSerialize = {};

    _.each(TYPES, function (type) {
        if (options.compact) {
            toSerialize[type] = that.getRowsCompact(undefined, type);
        } else {
            toSerialize[type] = that.getRows(undefined, type);
        }
    });

    serialize(toSerialize, options.compress, target);
};

/** Serialize the dataframe to the target in JSON format in column-wise order.
 * @param {string} target - filename to write to.
 * @param {Object} options - has flags 'compact' and 'compress'
 */
Dataframe.prototype.serializeColumns = function (target, options) {
    options = options || {};
    var that = this;
    var toSerialize = {};

    _.each(TYPES, function (type) {
        toSerialize[type] = {};
        var keys = that.getAttributeKeys(type);
        _.each(keys, function (key) {
            toSerialize[type][key] = that.data.attributes[type][key];
        });
    });

    serialize(toSerialize, options.compress, target);
};


//////////////////////////////////////////////////////////////////////////////
// Aggregations and Histograms
//////////////////////////////////////////////////////////////////////////////


Dataframe.prototype.aggregate = function (indices, attributes, binning, mode, type) {
    var that = this;

    function process(attribute, indices) {

        var goalNumberOfBins = binning ? binning._goalNumberOfBins : 0;
        var binningHint = binning ? binning[attribute] : undefined;
        var dataType = that.data.attributes[type][attribute].type;

        if (mode !== 'countBy' && dataType !== 'string') {
            return that.histogram(attribute, binningHint, goalNumberOfBins, indices, type);
        } else {
            return that.countBy(attribute, binningHint, indices, type);
        }
    }

    var keysToAggregate = attributes ? attributes : this.getAttributeKeys(type);
    keysToAggregate = keysToAggregate.filter(function (val) {
        return val[0] !== '_';
    });

    return _.object(_.map(keysToAggregate, function (attribute) {
        return [attribute, process(attribute, indices)];
    }));
};


Dataframe.prototype.countBy = function (attribute, binning, indices, type) {
    var values = this.data.attributes[type][attribute].values;

    // TODO: Get this value from a proper source, instead of hard coding.
    var maxNumBins = 29;

    if (indices.length === 0) {
        return {type: 'nodata'};
    }

    var rawBins = _.countBy(indices, function (valIdx) {
        return values[valIdx];
    });

    var numBins = Math.min(_.keys(rawBins).length, maxNumBins);
    var numBinsWithoutOther = numBins - 1;
    var sortedKeys = _.sortBy(_.keys(rawBins), function (key) {
        return -1 * rawBins[key];
    });

    // Copy over numBinsWithoutOther from rawBins to bins directly.
    // Take the rest and bucket them into '_other'
    var bins = {};
    _.each(sortedKeys.slice(0, numBinsWithoutOther), function (key) {
        bins[key] = rawBins[key]
    });

    var otherKeys = sortedKeys.slice(numBinsWithoutOther);
    if (otherKeys.length === 1) {
        bins[otherKeys[0]] = rawBins[otherKeys[0]];
    } else if (otherKeys.length > 1) {
        var sum = _.reduce(otherKeys, function (memo, key) {
            return memo + rawBins[key];
        }, 0);
        bins._other = sum;
    }

    var numValues = _.reduce(_.values(bins), function (memo, num) {
        return memo + num;
    }, 0);

    return {
        type: 'countBy',
        numValues: numValues,
        numBins: _.keys(bins).length,
        bins: bins,
    };
}

// Returns a binning object with properties numBins, binWidth, minValue,
// maxValue
function calculateBinning(numValues, values, indices, goalNumberOfBins) {

    var goalBins = numValues > 30 ? Math.ceil(Math.log(numValues) / Math.log(2)) + 1
                                 : Math.ceil(Math.sqrt(numValues));
    goalBins = Math.min(goalBins, 30); // Cap number of bins.
    goalBins = Math.max(goalBins, 8); // Cap min number of bins.

    var minMax = minMaxMasked(values, indices);
    var max = minMax.max;
    var min = minMax.min;

    var defaultBinning = {
        numBins: 1,
        binWidth: 1,
        minValue: -Infinity,
        maxValue: Infinity
    };

    if (goalNumberOfBins) {
        var numBins = goalNumberOfBins;
        var bottomVal = min;
        var topVal = max;
        var binWidth = (max - min) / numBins;

    // Try to find a good division.
    } else {
        var goalWidth = (max - min) / goalBins;

        var binWidth = 10;
        var numBins = (max - min) / binWidth;

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
            numBins = (max - min) / binWidth;
        }

        // Refine by doubling/halving
        var minBins = Math.max(3, Math.floor(goalBins / 2) - 1);
        while (numBins < minBins || numBins > goalBins) {
            if (numBins < minBins) {
                binWidth /= 2;
            } else {
                binWidth *= 2;
            }
            numBins = (max - min) / binWidth;
        }

        var bottomVal = round_down(min, binWidth);
        var topVal = round_up(max, binWidth);
        numBins = Math.round((topVal - bottomVal) / binWidth);
    }


    return {
        numBins: numBins,
        binWidth: binWidth,
        minValue: bottomVal,
        maxValue: topVal,
    };
}


Dataframe.prototype.histogram = function (attribute, binning, goalNumberOfBins, indices, type) {
    // Binning has binWidth, minValue, maxValue, and numBins

    // Disabled because filtering is expensive, and we now have type safety coming from
    // VGraph types.
    // values = _.filter(values, function (x) { return !isNaN(x)});

    var values = this.data.attributes[type][attribute].values;

    var numValues = indices.length;
    if (numValues === 0) {
        return {type: 'nodata'};
    }

    // Override if provided binning data.
    binning = binning || calculateBinning(numValues, values, indices, goalNumberOfBins);
    var numBins = binning.numBins;
    var binWidth = binning.binWidth;
    var bottomVal = binning.minValue;
    var topVal = binning.maxValue;
    var min = binning.minValue;
    var max = binning.maxValue;

    // Guard against 0 width case
    if (max === min) {
        binWidth = 1;
        numBins = 1;
        topVal = min + 1;
        bottomVal = min;
    }

    var bins = Array.apply(null, new Array(numBins)).map(function () { return 0; });

    var binId;
    for (var i = 0; i < indices.length; i++) {
        // Here we use an optimized "Floor" because we know it's a smallish, positive number.
        binId = ((values[indices[i]] - bottomVal) / binWidth) | 0;
        bins[binId]++;
    }

    return {
        type: 'histogram',
        numBins: numBins,
        binWidth: binWidth,
        numValues: numValues,
        maxValue: topVal,
        minValue: bottomVal,
        bins: bins
    };
};



//////////////////////////////////////////////////////////////////////////////
// Helper Functions
//////////////////////////////////////////////////////////////////////////////


function decodeStrings (attributes) {
    _.each(_.keys(attributes), function (key) {
        var decoded = _.map(attributes[key].values, function (val) {
            try {
                return (typeof val === 'string') ? decodeURIComponent(val) : val;
            } catch (e) {
                console.error('bad read val', val);
                return val;
            }
        });
        attributes[key].values = decoded;
    });
}

function decodeDates (attributes) {
    _.each(_.keys(attributes), function (key) {
        var isDate = key.indexOf('Date') > -1;
        var decoded = _.map(attributes[key].values, function (val) {
            return isDate && typeof(val) === "number" ?
                    dateFormat(val, 'mm-dd-yyyy') : val;
        });
        attributes[key].values = decoded;
    });
}


function pickTitleField (attribs, prioritized) {
    for (var i = 0; i < prioritized.length; i++) {
        var field = prioritized[i];
        if (attribs.hasOwnProperty(field)) {
            return field;
        }
    }
    return undefined;
}


function getNodeTitleField (attribs) {
    var prioritized = ['pointTitle', 'node', 'label', 'ip'];
    return pickTitleField(attribs, prioritized);
}


function getEdgeTitleField (attribs) {
    var prioritized = ['edgeTitle', 'edge'];
    return pickTitleField(attribs, prioritized);
}

function range (n) {
    var arr = [];
    for (var i = 0; i < n; i++) {
        arr.push(i);
    }
    return arr;
}


function round_down(num, multiple) {
    if (multiple == 0) {
        return num;
    }

    var div = num / multiple;
    return multiple * Math.floor(div);
}

function round_up(num, multiple) {
    if (multiple == 0) {
        return num;
    }

    var div = num / multiple;
    return multiple * Math.ceil(div);
}

function minMaxMasked(values, indices) {
    var min = Infinity;
    var max = -Infinity;

    _.each(indices, function (valueIdx) {
        var val = values[valueIdx];
        if (val < min) {
            min = val;
        }
        if (val > max) {
            max = val;
        }
    });
    return {max: max, min: min};
}

function serialize(data, compressFunction, target) {
    var serialized = JSON.stringify(data);

    if (compressFunction) {
        serialized = compressFunction(serialized);
    }

    fs.writeFileSync(baseDirPath + target, serialized);
}

module.exports = Dataframe;

'use strict';

var _ = require('underscore');
var dateFormat = require('dateformat');
var Q = require('q');
var fs = require('fs');

var baseDirPath = __dirname + '/../assets/dataframe/';
var TYPES = ['point', 'edge', 'simulator'];

var Dataframe = function () {
    // We keep a copy of the original data, plus a filtered view
    // that defaults to the new raw data.
    //
    // This is to allow tools like filters/selections to propagate to
    // all other tools that rely on data frames.

    this.rawdata = makeEmptyData();
    this.filteredBufferCache = {
        point: {},
        edge: {},
        simulator: {}
    };
    this.lastPointPositions = null;
    this.lastPointMask = [];
    this.data = this.rawdata;
};

function makeEmptyData () {
    return {
        attributes: {
            point: {},
            edge: {},
            simulator: {}
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
        numElements: {}
    };
}


//////////////////////////////////////////////////////////////////////////////
// Data Filtering
//////////////////////////////////////////////////////////////////////////////

// Takes in a mask of points, and returns an object
// containing masks for both the points and edges.
// Relative to forwardsEdgesTyped. (so sorted)
Dataframe.prototype.masksFromPoints = function (pointMask) {
    var pointMaskOriginalLookup = {};
    _.each(pointMask, function (newIdx, i) {
        pointMaskOriginalLookup[newIdx] = 1;
    });

    var edgeMask = [];
    var edges = this.rawdata.hostBuffers.forwardsEdges.edgesTyped;
    for (var i = 0; i < edges.length/2; i++) {
        var src = edges[2*i];
        var dst = edges[2*i + 1];
        var newSrc = pointMaskOriginalLookup[src];
        var newDst = pointMaskOriginalLookup[dst];
        if (newSrc && newDst) {
            edgeMask.push(i);
        };
    }

    return {
        edge: edgeMask,
        point: pointMask
    };
};

Dataframe.prototype.masksFromEdges = function (edgeMask) {
    var pointMask = [];
    var pointLookup = {};
    var edges = this.rawdata.hostBuffers.forwardsEdges.edgesTyped;

    _.each(edgeMask, function (edgeIdx) {
        var src = edges[2*edgeIdx];
        var dst = edges[2*edgeIdx + 1];
        pointLookup[src] = 1;
        pointLookup[dst] = 1;
    });

    var numPoints = this.rawdata.numElements.point;
    for (var i = 0; i < numPoints; i++) {
        if (pointLookup[i]) {
            pointMask.push(i);
        }
    }

    return {
        edge: edgeMask,
        point: pointMask
    };
};

Dataframe.prototype.getEdgeAttributeMask = function (attribute, start, stop) {
    var attr = this.rawdata.attributes.edge[attribute];
    var edgeMask = [];
    _.each(attr.values, function (val, idx) {
        if (val > start && val < stop) {
            edgeMask.push(idx);
        }
    });
    return edgeMask;
}

Dataframe.prototype.getPointAttributeMask = function (attribute, start, stop) {
    var attr = this.rawdata.attributes.point[attribute];
    var pointMask = [];
    _.each(attr.values, function (val, idx) {
        if (val > start && val < stop) {
            pointMask.push(idx);
        }
    });
    return pointMask;
};


// This does an inplace filter on this.data given masks.
// Mask is implemented as a list of valid indices (in sorted order).
// TODO: Take in Set objects, not just masks.
Dataframe.prototype.filter = function (masks, simulator) {
    console.log('Filtering');

    var start = Date.now();

    var that = this;
    var rawdata = that.rawdata;
    var newData = makeEmptyData();
    var numPoints = (masks.point) ? masks.point.length : rawdata.numElements.point;
    var numEdges = (masks.edge) ? masks.edge.length : rawdata.numElements.edge;
    // attributes;
    // TODO: implement filter on attributes as a mask, since this can
    // be huge.
    _.each(TYPES, function (type) {
        var mask;
        // TODO: Support more complex masks.
        if (type === 'edge') {
            mask = masks['edge'];
        } else {
            mask = masks['point'];
        }

        var attrs = rawdata.attributes[type];
        var newAttrs = newData.attributes[type];
        _.each(_.keys(attrs), function (key) {
            var attr = attrs[key];
            var newValues = [];
            _.each(mask, function (idx) {
                newValues.push(attr.values[idx]);
            });
            newAttrs[key] = {
                values: newValues,
                type: attr.type,
                target: attr.target
            };
        });
    });


    // TODO: Does this need to be updated, since it gets rewritten at each tick? Maybe zerod out?
    // rendererBuffers;
    // Skipping for now, since we use null renderer.

    // labels;
    _.each(['point', 'edge'], function (type) {
        if (rawdata.labels[type]) {
            var newLabels = [];
            _.each(masks[type], function (idx) {
                newLabels.push(rawdata.labels[type][idx]);
            });
            newData.labels[type] = newLabels;
        }
    });

    // buffers;
    // We have to deal with generic buffers differently from
    // simulator buffers, since simulator buffers are more complex
    // and not straightforward filters.
    var newBuffers = newData.buffers;
    var rawBuffers = rawdata.buffers;

    // TODO: Regular Buffers
    // _.each(_.keys(rawBuffers), function (key) {
    //     // TODO, since we don't ever use these yet.
    //     console.error('[Not implemented yet]: Attempting to filter with GPU attributes.');
    // });

    ///////////////////////////////////////////////////////////////////////////
    // Simulator / Graph Specific stuff. TODO: Should this be in the dataframe?
    ///////////////////////////////////////////////////////////////////////////

    // Filter out to new edges/points arrays.
    var filteredEdges = Uint32Array(masks.edge.length * 2);
    var forwardsEdges = rawdata.hostBuffers.forwardsEdges.edgesTyped;

    var pointOriginalLookup = [];
    _.each(masks.point, function (oldIdx, i) {
        pointOriginalLookup[oldIdx] = i;
    });

    _.each(masks.edge, function (oldIdx, i) {
        filteredEdges[i*2] = pointOriginalLookup[forwardsEdges[oldIdx*2]];
        filteredEdges[i*2 + 1] = pointOriginalLookup[forwardsEdges[oldIdx*2 + 1]];
    });

    var filteredPoints = []; // TODO:

    // hostBuffers: points,unsortedEdges,forwardsEdges,backwardsEdges
    // TODO: Do points ever change? Ask Paden.

    var edgesFlipped = new Uint32Array(filteredEdges.length);
    for (var i = 0; i < filteredEdges.length/2; i++) {
        edgesFlipped[2 * i] = filteredEdges[2 * i + 1];
        edgesFlipped[2 * i + 1] = filteredEdges[2 * i];
    }

    newData.hostBuffers.unsortedEdges = filteredEdges;
    var forwardsEdges = this.encapsulateEdges(filteredEdges, numPoints);
    var backwardsEdges = this.encapsulateEdges(edgesFlipped, numPoints);
    newData.hostBuffers.forwardsEdges = forwardsEdges;
    newData.hostBuffers.backwardsEdges = backwardsEdges;
    newData.hostBuffers.points = rawdata.hostBuffers.points;

    newData.localBuffers.logicalEdges = forwardsEdges.edgesTyped;

    // TODO: Figured out what pointTags is used for
    // TODO: Figure out what edgeTags are used for.

    var newPointSizes = new Uint8Array(numPoints);
    _.each(masks.point, function (idx, i) {
        newPointSizes[i] = rawdata.localBuffers.pointSizes[idx];
    });
    newData.localBuffers.pointSizes = newPointSizes;

    var newPointColors = new Uint32Array(numPoints);
    _.each(masks.point, function (idx, i) {
        newPointColors[i] = rawdata.localBuffers.pointColors[idx];
    });
    newData.localBuffers.pointColors = newPointColors;

    var newEdgeColors = new Uint32Array(masks.edge.length * 2);
    _.each(masks.edge, function (idx, i) {
        newEdgeColors[i*2] = rawdata.localBuffers.edgeColors[idx*2];
        newEdgeColors[i*2 + 1] = rawdata.localBuffers.edgeColors[idx*2 + 1];
    });
    newData.localBuffers.edgeColors = newEdgeColors;

    var newMidEdgeColors = new Uint32Array(masks.edge.length * 4);
    _.each(masks.edge, function (idx, i) {
        newMidEdgeColors[i*2] = rawdata.localBuffers.midEdgeColors[idx*2];
        newMidEdgeColors[i*2 + 1] = rawdata.localBuffers.midEdgeColors[idx*2 + 1];
        newMidEdgeColors[i*2 + 2] = rawdata.localBuffers.midEdgeColors[idx*2 + 2];
        newMidEdgeColors[i*2 + 3] = rawdata.localBuffers.midEdgeColors[idx*2 + 3];
    });
    newData.localBuffers.midEdgeColors = newMidEdgeColors;

    var newEdgeWeights = new Uint32Array(masks.edge.length * 2);
    _.each(masks.edge, function (idx, i) {
        newEdgeWeights[i*2] = rawdata.localBuffers.edgeWeights[idx*2];
        newEdgeWeights[i*2 + 1] = rawdata.localBuffers.edgeWeights[idx*2 + 1];
    });
    newData.localBuffers.edgeWeights = newEdgeWeights;

    // numElements;
    // Copy all old in.
    _.each(_.keys(rawdata.numElements), function (key) {
        newData.numElements[key] = rawdata.numElements[key];
    });
    // Update point/edge counts, since those were filtered,
    // along with forwardsWorkItems/backwardsWorkItems.
    _.each(['point', 'edge'], function (key) {
        newData.numElements[key] = masks[key].length;
    });
    newData.numElements.forwardsWorkItems = newData.hostBuffers.forwardsEdges.workItemsTyped.length / 4;
    newData.numElements.backwardsWorkItems = newData.hostBuffers.backwardsEdges.workItemsTyped.length / 4;
    // TODO: NumMidPoints and MidEdges

    //////////////////////////////////
    // SIMULATOR BUFFERS.
    //////////////////////////////////

    // Prev Forces Float32Array * numPoint * 2
    // degrees Uint32Array  * numPoint
    // springsPos Float32Array * numEdge * 4
    // edgeWeights Float32Array * numEdge

    // TODO: curPoints so things don't fly around
    // curPoints Float32Array * numPoint * 2
    // TODO: Point Color + Point Size
    var oldNumPoints = rawdata.numElements.point;
    var oldNumEdges = rawdata.numElements.edge;

    var tempPrevForces = new Float32Array(oldNumPoints * 2);
    var tempDegrees = new Uint32Array(oldNumPoints);
    var tempSpringsPos = new Float32Array(oldNumEdges * 4);
    var tempEdgeWeights = new Float32Array(oldNumEdges * 2);
    var tempCurPoints = new Float32Array(oldNumPoints * 2);

    var newPrevForces = new Float32Array(numPoints * 2);
    var newDegrees = new Uint32Array(numPoints);
    var newSpringsPos = new Float32Array(numEdges * 4);
    var newEdgeWeights = new Float32Array(numEdges * 2);
    var newCurPoints = new Float32Array(numPoints * 2);

    var rawSimBuffers = rawdata.buffers.simulator;
    var filteredSimBuffers = that.data.buffers.simulator;

    return Q.all([
        rawSimBuffers.prevForces.read(tempPrevForces),
        rawSimBuffers.degrees.read(tempDegrees),
        rawSimBuffers.springsPos.read(tempSpringsPos),
        rawSimBuffers.edgeWeights.read(tempEdgeWeights),
        filteredSimBuffers.curPoints.read(tempCurPoints)
    ]).spread(function () {

        ///////////////////////////////////////
        // Update last locations of points
        ///////////////////////////////////////

        var promise;
        // TODO: Move this into general initialization
        if (!that.lastPointPositions) {
            console.log('Initializing lastPointPositions');
            that.lastPointPositions = new Float32Array(rawdata.numElements.point * 2);
            _.each(tempCurPoints, function (point, i) {
                that.lastPointPositions[i] = point;
            });

            promise = simulator.renderer.createBuffer(that.lastPointPositions, 'curPointsFiltered')
                    .then(function (pointVBO) {
                        return simulator.cl.createBufferGL(pointVBO, 'curPointsFiltered');
                    }).then(function (pointBuf) {
                        that.filteredBufferCache.simulator.curPoints = pointBuf;
                    });

        } else {
            console.log('Updating lastPointPositions');
            _.each(that.lastPointMask, function (idx, i) {
                that.lastPointPositions[idx*2] = tempCurPoints[i*2];
                that.lastPointPositions[idx*2 + 1] = tempCurPoints[i*2 + 1];
            });

            promise = Q({});
        }

        return promise;

    }).then(function () {

        _.each(masks.point, function (oldIdx, i) {
            newPrevForces[i*2] = tempPrevForces[oldIdx*2];
            newPrevForces[i*2 + 1] = tempPrevForces[oldIdx*2 + 1];

            newDegrees[i] = tempDegrees[oldIdx];

            newCurPoints[i*2] = that.lastPointPositions[oldIdx*2];
            newCurPoints[i*2 + 1] = that.lastPointPositions[oldIdx*2 + 1];

        });

        _.each(masks.edge, function (oldIdx, i) {
            newSpringsPos[i*4] = tempSpringsPos[oldIdx*4];
            newSpringsPos[i*4 + 1] = tempSpringsPos[oldIdx*4 + 1];
            newSpringsPos[i*4 + 2] = tempSpringsPos[oldIdx*4 + 2];
            newSpringsPos[i*4 + 3] = tempSpringsPos[oldIdx*4 + 3];

            newEdgeWeights[i*2] = tempEdgeWeights[oldIdx*2];
            newEdgeWeights[i*2 + 1] = tempEdgeWeights[oldIdx*2 + 1];
        });

        _.each(['curPoints', 'prevForces', 'degrees', 'forwardsEdges', 'forwardsDegrees',
                'forwardsWorkItems', 'forwardsEdgeStartEndIdxs', 'backwardsEdges',
                'backwardsDegrees', 'backwardsWorkItems', 'backwardsEdgeStartEndIdxs',
                'springsPos', 'edgeWeights'
                ], function (key) {

            newData.buffers.simulator[key] = that.filteredBufferCache.simulator[key];
        });

        var newBuffers = newData.buffers.simulator;
        return Q.all([
            newBuffers.curPoints.write(newCurPoints),
            newBuffers.prevForces.write(newPrevForces),
            newBuffers.degrees.write(newDegrees),
            newBuffers.springsPos.write(newSpringsPos),
            newBuffers.edgeWeights.write(newEdgeWeights),
            newBuffers.forwardsEdges.write(forwardsEdges.edgesTyped),
            newBuffers.forwardsDegrees.write(forwardsEdges.degreesTyped),
            newBuffers.forwardsWorkItems.write(forwardsEdges.workItemsTyped),
            newBuffers.forwardsEdgeStartEndIdxs.write(forwardsEdges.edgeStartEndIdxsTyped),
            newBuffers.backwardsEdges.write(backwardsEdges.edgesTyped),
            newBuffers.backwardsDegrees.write(backwardsEdges.degreesTyped),
            newBuffers.backwardsWorkItems.write(backwardsEdges.workItemsTyped),
            newBuffers.backwardsEdgeStartEndIdxs.write(backwardsEdges.edgeStartEndIdxsTyped)
        ]);
    }).then(function () {

        // Just in case, copy over references from rawdata to newData
        // This means we don't have to explicity overwrite everything.

        _.each(_.keys(rawdata.buffers.simulator), function (key) {
            if (!newData.buffers.simulator[key]) {
                newData.buffers.simulator[key] = rawdata.buffers.simulator[key];
            }
        });

        _.each(_.keys(rawdata.localBuffers), function (key) {
            if (!newData.localBuffers[key]) {
                newData.localBuffers[key] = rawdata.localBuffers[key];
            }
        });

        _.each(_.keys(rawdata.numElements), function (key) {
            if (!newData.numElements[key]) {
                newData.numElements[key] = rawdata.numElements[key];
            }
        });

        _.each(_.keys(rawdata.rendererBuffers), function (key) {
            if (!newData.rendererBuffers[key]) {
                newData.rendererBuffers[key] = rawdata.rendererBuffers[key];
            }
        });

        _.each(_.keys(rawdata.hostBuffers), function (key) {
            if (!newData.hostBuffers[key]) {
                newData.hostBuffers[key] = rawdata.hostBuffers[key];
            }
        });

        // Bump versions of every buffer.
        // TODO: Decide if this is really necessary.
        _.each(_.keys(simulator.versions.buffers), function (key) {
            simulator.versions.buffers[key] += 1;
        });

        that.lastPointMask = masks.point || [];

    }).then(function () {
        console.log('Filter took ' + (Date.now() - start) + ' ms.');
        that.data = newData;
    });

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
    console.log('filteredKeys: ', filteredKeys);


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

Dataframe.prototype.writeBuffer = function (name, type, values, simulator) {
    var that = this;
    var byteLength = values.byteLength;
    var buffer = this.rawdata.buffers[type][name];

    // If it's written to directly, we assume we want to also
    // have a buffer to write to during filters.
    return simulator.cl.createBuffer(byteLength, name+'Filtered')
        .then(function (filteredBuffer) {
            that.filteredBufferCache.simulator[name] = filteredBuffer;
            return buffer.write(values);
        });
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

Dataframe.prototype.getAllBuffers = function (type) {
    return this.data.buffers[type];
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

    // Too much of our code relies on being able to get back undefineds
    // Will reenable this once we refactor those parts of the code.

    // if (!res) {
    //     console.log("Invalid Buffer[" + type + "]: " + name);
    //     throw "Invalid Buffer[" + type + "]: " + name;
    // }
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

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function computeEdgeList(edges) {
    //[[src idx, dest idx, original idx]]
    // console.log('edges: ', edges);
    // console.log('edge constructor: ', edges.constructor);
    var start = Date.now();
    // var maskedEdges = new Float64Array(edges.buffer);
    var edgeList = new Array(edges.length / 2);
    // var mapped = new Array(edges.length / 2);
    // for (var i = 0; i < edges.length/2; i++) {
    //     // edgeList[i] = [edges[2 * i], edges[2 * i + 1], i];
    //     // mapped[i] = [edges[2*i] * 1000000000000 + edges[2*i + 1], i];
    //     mapped[i] = i;
    // }
    var mapped = _.range(edges.length / 2);

    var middle = Date.now();

    mapped.sort(function (a, b) {
        return edges[a*2] < edges[b*2] ? -1
                : edges[a*2] > edges[b*2] ? 1
                : edges[a*2 + 1] - edges[b*2 + 1];
    });

    // mapped.sort(function (a, b) {
    //     return a[0] - b[0];
    // });

    // var result = mapped.map(function (el) {
    //     return edgeList[el[1]];
    // });

    for (var i = 0; i < edges.length/2 ; i++) {
        var idx = mapped[i]*2;
        edgeList[i] = [edges[idx], edges[idx + 1], idx / 2];
    }


    // for (var i = 0; i < edges.length/2 ; i++) {
    //     var idx = mapped[i][1];
    //     edgeList[i] = [edges[2 * idx], edges[2*idx + 1], idx];
    // }


    //sort by src idx, then dst idx
    // edgeList.sort(function (a, b) {
    //     return mapped[a[2]] - mapped[b[2]];
    // });



    //sort by src idx
    // edgeList.sort(function(a, b) {
    //     return a[0] < b[0] ? -1
    //         : a[0] > b[0] ? 1
    //         : a[1] - b[1];
    // });

    var end = Date.now();
    console.log('EdgeList Times: ', middle - start, end - middle);

    // return result;
    return edgeList;
}

function computeWorkItemsTyped(edgeList, numPoints) {
     // [ [first edge number from src idx, numEdges from source idx, source idx], ... ]
    var workItemsTyped = new Int32Array(numPoints*4);
    var edgeListLastPos = 0;
    var edgeListLastSrc = edgeList[0][0];
    for (var i = 0; i < numPoints; i++) {

        // Case where node has edges
        if (edgeListLastSrc === i) {
            var startingIdx = edgeListLastPos;
            var count = 0;
            while (edgeListLastPos < edgeList.length && edgeList[edgeListLastPos][0] === i) {
                count++;
                edgeListLastPos++;
            }
            edgeListLastSrc = edgeListLastPos < edgeList.length ? edgeList[edgeListLastPos][0] : -1;
            workItemsTyped[i*4] = startingIdx;
            workItemsTyped[i*4 + 1] = count;
            workItemsTyped[i*4 + 2] = i;
        // Case where node has no edges
        } else {
            workItemsTyped[i*4] = -1;
            workItemsTyped[i*4 + 1] = 0;
            workItemsTyped[i*4 + 2] = i;
        }
    }

    return workItemsTyped;
}

function computeEdgeStartEndIdxs(workItemsTyped, edgeList, edges) {
    var index = 0;
    var edgeStartEndIdxs = [];
    for(var i = 0; i < (workItemsTyped.length/4) - 1; i++) {
      var start = workItemsTyped[i*4];
      if (start == -1) {
        edgeStartEndIdxs.push([-1, -1]);
      } else {
        var end = workItemsTyped[(i+1)*4];
        var j = i+1;
        while (end < 0 && ((j + 1) < (workItemsTyped.length/4))) {
          end = workItemsTyped[(j + 1)*4];
          j = j + 1;
        }

        if (end === -1) {
            end = edgeList.length; // Special case for last workitem
        }

        edgeStartEndIdxs.push([start, end]);
      }
    }
    if (workItemsTyped[(workItemsTyped.length - 4)] !== -1) {
      edgeStartEndIdxs.push([workItemsTyped[workItemsTyped.length - 4], edges.length /2]);
    } else {
      edgeStartEndIdxs.push([-1, -1]);
    }
    return edgeStartEndIdxs;
}


Dataframe.prototype.encapsulateEdges = function (edges, numPoints) {

    //[[src idx, dest idx, original idx]]
    var edgeList = computeEdgeList(edges);

    var edgePermutationTyped = new Uint32Array(edgeList.length);
    var edgePermutationInverseTyped = new Uint32Array(edgeList.length);
    edgeList.forEach(function (edge, i) {
        edgePermutationTyped[edge[2]] = i;
        edgePermutationInverseTyped[i] = edge[2];
    })


     // [ [first edge number from src idx, numEdges from source idx, source idx], ... ]
    var workItemsTyped = computeWorkItemsTyped(edgeList, numPoints);

    var degreesTyped = new Uint32Array(numPoints);
    var srcToWorkItem = new Int32Array(numPoints);

    for (var i = 0; i < numPoints; i++) {
        srcToWorkItem[workItemsTyped[i*4 + 2]] = i;
        degreesTyped[workItemsTyped[i*4 + 2]] = workItemsTyped[i*4 + 1];
    }

    //workItemsTyped is a Uint32Array [first edge number from src idx, number of edges from src idx, src idx, 666]
    //fetch edge to find src and dst idx (all src same)
    //num edges > 0

    // Without Underscore and with preallocation. Less clear than a flatten, but better perf.
    var edgesTyped = new Uint32Array(edgeList.length * 2);
    for (var idx = 0; idx < edgeList.length; idx++) {
        edgesTyped[idx*2] = edgeList[idx][0];
        edgesTyped[idx*2 + 1] = edgeList[idx][1];
    }

    var edgeStartEndIdxs = computeEdgeStartEndIdxs(workItemsTyped, edgeList, edges);

    // Flattening
    var edgeStartEndIdxsTyped = new Uint32Array(edgeStartEndIdxs.length * 2);
    for (var idx = 0; idx < edgeStartEndIdxs.length; idx++) {
        edgeStartEndIdxsTyped[idx*2] = edgeStartEndIdxs[idx][0];
        edgeStartEndIdxsTyped[idx*2 + 1] = edgeStartEndIdxs[idx][1];
    }

    return {
        //Uint32Array
        degreesTyped: degreesTyped,

        //Uint32Array [(srcIdx, dstIdx), ...]
        //(edges ordered by src idx)
        edgesTyped: edgesTyped,

        //Uint32Array [where unsorted edge now sits]
        edgePermutation: edgePermutationTyped,

        //Uint32Array [where sorted edge used to it]
        edgePermutationInverseTyped: edgePermutationInverseTyped,

        //Uint32Array [(edge number, number of sibling edges), ... ]
        numWorkItems: workItemsTyped.length,

        //Int32Array [(first edge number, number of sibling edges)]
        workItemsTyped: workItemsTyped,

        //Uint32Array [workitem number node belongs to]
        srcToWorkItem: srcToWorkItem,

        edgeStartEndIdxsTyped: edgeStartEndIdxsTyped
    };
}


module.exports = Dataframe;

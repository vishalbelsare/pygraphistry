'use strict';

var _ = require('underscore');
var dateFormat = require('dateformat');
var Q = require('q');
var fs = require('fs');

var log = require('common/logger.js');
var logger = log.createLogger('graph-viz:dataframe');

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
    this.typedArrayCache = {};
    this.lastPointPositions = null;
    /** @type MaskSet */
    this.lastMasks = {
        point: [],
        edge: []
    };
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

/**
 * Takes in a mask of points, and returns an object
 * containing masks for both the points and edges.
 * Relative to forwardsEdges (so sorted)
 * @param {Mask} pointMask
 * @returns MaskSet
 */
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
        }
    }

    return {
        edge: edgeMask,
        point: pointMask
    };
};


Dataframe.prototype.numPoints = function numPoints() {
    return this.rawdata.numElements.point;
};


Dataframe.prototype.numEdges = function numEdges() {
    return this.rawdata.numElements.edge;
};


/**
 * @returns Mask
 */
Dataframe.prototype.fullPointMask = function() {
    return _.range(this.numPoints());
};

/**
 * @returns Mask
 */
Dataframe.prototype.fullEdgeMask = function() {
    return _.range(this.numEdges());
};


/**
 * @returns MaskSet
 */
Dataframe.prototype.fullMaskSet = function() {
    return {
        point: this.fullPointMask(),
        edge: this.fullEdgeMask()
    }
};


/**
 * @param {Mask} edgeMask
 * @returns MaskSet
 */
Dataframe.prototype.masksFromEdges = function (edgeMask) {
    var pointMask = [];
    var numPoints = this.numPoints();

    pointMask = _.range(numPoints);

    // var pointLookup = {};
    // var edges = this.rawdata.hostBuffers.forwardsEdges.edgesTyped;

    // _.each(edgeMask, function (edgeIdx) {
    //     var src = edges[2*edgeIdx];
    //     var dst = edges[2*edgeIdx + 1];
    //     pointLookup[src] = 1;
    //     pointLookup[dst] = 1;
    // });

    // for (var i = 0; i < numPoints; i++) {
    //     if (pointLookup[i]) {
    //         pointMask.push(i);
    //     }
    // }

    return {
        edge: edgeMask,
        point: pointMask
    };
};

/**
 * @param {MaskList} maskList
 * @returns MaskSet
 */
Dataframe.prototype.composeMasks = function (maskList) {
    if (maskList === undefined || !maskList.length || maskList.length === 0) {
        return this.fullMaskSet();
    }
    // TODO: Make this faster.

    // Assumes we will never have more than 255 separate masks.
    var numMasks = maskList.length;
    if (numMasks > 255) {
        console.error('TOO MANY MASKS');
        return;
    }

    var edgeMask = [];
    var pointMask = [];

    // Assumes Uint8Array() constructor initializes to zero, which it should.
    var pointLookup = new Uint8Array(this.numPoints());
    var edgeLookup = new Uint8Array(this.numEdges());

    _.each(maskList, function (mask) {
        _.each(mask.edge, function (idx) {
            edgeLookup[idx]++;
        });

        _.each(mask.point, function (idx) {
            pointLookup[idx]++;
        });
    });

    _.each(edgeLookup, function (count, i) {
        if (count === numMasks) {
            edgeMask.push(i);
        }
    });

    _.each(pointLookup, function (count, i) {
        if (count === numMasks) {
            pointMask.push(i);
        }
    });

    return {
        point: pointMask,
        edge: edgeMask
    };
};

/**
 * @typedef {Object} ClientQuery
 */

/**
 * @param {ClientQuery} params
 * @returns Function<Object>
 */
Dataframe.prototype.filterFuncForQueryObject = function (params) {
    var filterFunc;

    if (params.start !== undefined && params.stop !== undefined) {
        // Range:
        filterFunc = function (val) {
            return val >= params.start && val < params.stop;
        };

    } else if (params.equals !== undefined) {
        // Exact match or list-contains:
        var compareValue = params.equals;
        if (_.isArray(compareValue)) {
            filterFunc = function (val) {
                return _.contains(compareValue, val);
            };
        } else {
            filterFunc = function (val) {
                return compareValue === val;
            };
        }
    }
    return filterFunc;
};


/**
 * @param {Array} attributes
 * @param {Function<Object>} filterFunc
 * @returns Mask
 */
Dataframe.prototype.getMaskForFilterOnAttributes = function (attributes, filterFunc) {
    var mask = [];
    if (filterFunc) {
        _.each(attributes, function (val, idx) {
            if (filterFunc(val)) {
                mask.push(idx);
            }
        });
    }
    return mask;
};


/**
 * Returns sorted edge mask
 * @param {String} dataframeAttribute
 * @param {ClientQuery} params
 * @returns {Mask}
 */
Dataframe.prototype.getEdgeAttributeMask = function (dataframeAttribute, params) {
    var attr = this.rawdata.attributes.edge[dataframeAttribute];
    var filterFunc = this.filterFuncForQueryObject(params);
    var edgeMask = this.getMaskForFilterOnAttributes(attr.values, filterFunc);
    // Convert to sorted order
    var map = this.rawdata.hostBuffers.forwardsEdges.edgePermutation;
    for (var i = 0; i < edgeMask.length; i++) {
        edgeMask[i] = map[edgeMask[i]];
    }
    return edgeMask;
};


/**
 * Returns sorted point mask
 * @param {String} dataframeAttribute
 * @param {ClientQuery} params
 * @returns {Mask}
 */
Dataframe.prototype.getPointAttributeMask = function (dataframeAttribute, params) {
    var attr = this.rawdata.attributes.point[dataframeAttribute];
    var filterFunc = this.filterFuncForQueryObject(params);
    return this.getMaskForFilterOnAttributes(attr.values, filterFunc);
};


Dataframe.prototype.initializeTypedArrayCache = function (oldNumPoints, oldNumEdges) {
    this.typedArrayCache.filteredEdges = new Uint32Array(oldNumEdges * 2);
    this.typedArrayCache.unsortedEdgeMask = new Uint32Array(oldNumEdges);
    this.typedArrayCache.edgesFlipped = new Uint32Array(oldNumEdges * 2);

    this.typedArrayCache.newPointSizes = new Uint8Array(oldNumPoints);
    this.typedArrayCache.newPointColors = new Uint32Array(oldNumPoints);
    this.typedArrayCache.newEdgeColors = new Uint32Array(oldNumEdges * 2);
    this.typedArrayCache.newEdgeHeights = new Uint32Array(oldNumEdges * 2);
    var numRenderedSplits = this.rawdata.numElements.renderedSplits;
    var numMidEdgeColorsPerEdge = 2 * (numRenderedSplits + 1);
    var numMidEdgeColors = numMidEdgeColorsPerEdge * oldNumEdges;
    this.typedArrayCache.newMidEdgeColors = new Uint32Array(numMidEdgeColors);
    this.typedArrayCache.newBackwardsEdgeWeights = new Float32Array(oldNumEdges);
    this.typedArrayCache.newForwardsEdgeWeights = new Float32Array(oldNumEdges);

    this.typedArrayCache.tempPrevForces = new Float32Array(oldNumPoints * 2);
    this.typedArrayCache.tempDegrees = new Uint32Array(oldNumPoints);
    this.typedArrayCache.tempSpringsPos = new Float32Array(oldNumEdges * 4);
    this.typedArrayCache.tempBackwardsEdgeWeights = new Float32Array(oldNumEdges);
    this.typedArrayCache.tempForwardsEdgeWeights = new Float32Array(oldNumEdges);
    this.typedArrayCache.tempCurPoints = new Float32Array(oldNumPoints * 2);

    this.typedArrayCache.newPrevForces = new Float32Array(oldNumPoints * 2);
    this.typedArrayCache.newDegrees = new Uint32Array(oldNumPoints);
    this.typedArrayCache.newSpringsPos = new Float32Array(oldNumEdges * 4);
    this.typedArrayCache.newCurPoints = new Float32Array(oldNumPoints * 2);
};

/**
 * Mask is implemented as a list of valid indices (in sorted order).
 * @typedef Array<Number> Mask
 */

/**
 * @typedef Array<Mask> MaskList
 */

/**
 * @typedef {{point: Mask, edge: Mask}} MaskSet
 */

/**
 * Filters this.data in-place given masks. Does not modify this.rawdata.
 * TODO: Take in Set objects, not just Mask.
 * @param {MaskSet} masks
 * @returns {Promise.<Array<Buffer>>}
 */
Dataframe.prototype.filter = function (masks, simulator) {
    logger.debug('Starting Filter');

    var start = Date.now();

    var that = this;
    var rawdata = that.rawdata;
    var newData = makeEmptyData();
    var numPoints = (masks.point) ? masks.point.length : rawdata.numElements.point;
    var numEdges = (masks.edge) ? masks.edge.length : rawdata.numElements.edge;
    var oldNumPoints = rawdata.numElements.point;
    var oldNumEdges = rawdata.numElements.edge;

    // TODO: Should this be lazy, or done at startup?
    if (_.keys(that.typedArrayCache).length === 0) {
        that.initializeTypedArrayCache(oldNumPoints, oldNumEdges);
    }

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

    // TODO: Regular Data GPU Buffers
    // TODO: Figure out how GC/memory management works.

    ///////////////////////////////////////////////////////////////////////////
    // Simulator / Graph Specific stuff. TODO: Should this be in the dataframe?
    ///////////////////////////////////////////////////////////////////////////

    // Filter out to new edges/points arrays.
    var filteredEdges = new Uint32Array(that.typedArrayCache.filteredEdges.buffer, 0, masks.edge.length * 2);
    var originalEdges = rawdata.hostBuffers.unsortedEdges;
    var originalForwardsEdges = rawdata.hostBuffers.forwardsEdges.edgesTyped;

    var unsortedEdgeMask = new Uint32Array(that.typedArrayCache.unsortedEdgeMask.buffer, 0, masks.edge.length);

    var map = rawdata.hostBuffers.forwardsEdges.edgePermutationInverseTyped;
    for (var i = 0; i < masks.edge.length; i++) {
        unsortedEdgeMask[i] = map[masks.edge[i]];
    }

    // TODO: See if there's a way to do this without sorting.
    // Sorting is slow as all hell.
    Array.prototype.sort.call(unsortedEdgeMask, function (a, b) {
        return a - b;
    });

    var unsortedMasks = {
        point: masks.point,
        edge: unsortedEdgeMask
    };

    var pointOriginalLookup = [];
    for (var i = 0; i < masks.point.length; i++) {
        pointOriginalLookup[masks.point[i]] = i;
    }

    for (var i = 0; i < unsortedEdgeMask.length; i++) {
        var oldIdx = unsortedEdgeMask[i];
        filteredEdges[i*2] = pointOriginalLookup[originalEdges[oldIdx*2]];
        filteredEdges[i*2 + 1] = pointOriginalLookup[originalEdges[oldIdx*2 + 1]];
    }

    var edgesFlipped = new Uint32Array(that.typedArrayCache.edgesFlipped.buffer, 0, filteredEdges.length);

    for (var i = 0; i < filteredEdges.length/2; i++) {
        edgesFlipped[2 * i] = filteredEdges[2 * i + 1];
        edgesFlipped[2 * i + 1] = filteredEdges[2 * i];
    }

    newData.hostBuffers.unsortedEdges = filteredEdges;
    var forwardsEdges = this.encapsulateEdges(filteredEdges, numPoints, rawdata.hostBuffers.forwardsEdges, unsortedMasks, pointOriginalLookup);
    var backwardsEdges = this.encapsulateEdges(edgesFlipped, numPoints, rawdata.hostBuffers.backwardsEdges, unsortedMasks, pointOriginalLookup);
    newData.hostBuffers.forwardsEdges = forwardsEdges;
    newData.hostBuffers.backwardsEdges = backwardsEdges;
    newData.hostBuffers.points = rawdata.hostBuffers.points;

    newData.localBuffers.logicalEdges = forwardsEdges.edgesTyped;
    newData.localBuffers.forwardsEdgeStartEndIdxs = forwardsEdges.edgeStartEndIdxsTyped;
    newData.localBuffers.backwardsEdgeStartEndIdxs = backwardsEdges.edgeStartEndIdxsTyped;

    ///////////////////////////////////////////////////////////////////////////
    // Copy non-GPU buffers
    ///////////////////////////////////////////////////////////////////////////

    // TODO: Figured out what pointTags is used for
    // TODO: Figure out what edgeTags are used for.

    var newPointSizes = new Uint8Array(that.typedArrayCache.newPointSizes.buffer, 0, numPoints);
    var newPointColors = new Uint32Array(that.typedArrayCache.newPointColors.buffer, 0, numPoints);

    for (var i = 0; i < masks.point.length; i++) {
        newPointSizes[i] = rawdata.localBuffers.pointSizes[masks.point[i]];
        newPointColors[i] = rawdata.localBuffers.pointColors[masks.point[i]];
    }
    newData.localBuffers.pointSizes = newPointSizes;
    newData.localBuffers.pointColors = newPointColors;

    var numRenderedSplits = rawdata.numElements.renderedSplits;
    var numMidEdgeColorsPerEdge = 2 * (numRenderedSplits + 1);
    var numMidEdgeColors = numMidEdgeColorsPerEdge * masks.edge.length;
    var newEdgeColors = new Uint32Array(that.typedArrayCache.newEdgeColors.buffer, 0, masks.edge.length * 2);
    var newEdgeHeights = new Uint32Array(that.typedArrayCache.newEdgeHeights.buffer, 0, masks.edge.length * 2);
    var newMidEdgeColors = new Uint32Array(that.typedArrayCache.newMidEdgeColors.buffer, 0, numMidEdgeColors);

    for (var i = 0; i < masks.edge.length; i++) {
        var idx = masks.edge[i];

        newEdgeColors[i*2] = rawdata.localBuffers.edgeColors[idx*2];
        newEdgeColors[i*2 + 1] = rawdata.localBuffers.edgeColors[idx*2 + 1];

        newEdgeHeights[i*2] = rawdata.localBuffers.edgeHeights[idx*2];
        newEdgeHeights[i*2 + 1] = rawdata.localBuffers.edgeHeights[idx*2 + 1];

        for (var j = 0; j < numMidEdgeColorsPerEdge; j++) {
            newMidEdgeColors[i*numMidEdgeColorsPerEdge + j] =
                    rawdata.localBuffers.midEdgeColors[idx*numMidEdgeColorsPerEdge + j];
        }
    }
    newData.localBuffers.edgeColors = newEdgeColors;
    newData.localBuffers.edgeHeights = newEdgeHeights;
    newData.localBuffers.midEdgeColors = newMidEdgeColors;

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

    var tempPrevForces = new Float32Array(that.typedArrayCache.tempPrevForces.buffer, 0, oldNumPoints * 2);
    var tempSpringsPos = new Float32Array(that.typedArrayCache.tempSpringsPos.buffer, 0, oldNumEdges * 4);
    var tempForwardsEdgeWeights = new Float32Array(that.typedArrayCache.tempForwardsEdgeWeights.buffer, 0, oldNumEdges);
    var tempBackwardsEdgeWeights = new Float32Array(that.typedArrayCache.tempBackwardsEdgeWeights.buffer, 0, oldNumEdges);
    var tempCurPoints = new Float32Array(that.typedArrayCache.tempCurPoints.buffer, 0, oldNumPoints * 2);

    var newPrevForces = new Float32Array(that.typedArrayCache.newPrevForces.buffer, 0, numPoints * 2);
    var newDegrees = new Uint32Array(that.typedArrayCache.newDegrees.buffer, 0, numPoints);
    var newSpringsPos = new Float32Array(that.typedArrayCache.newSpringsPos.buffer, 0, numEdges * 4);
    var newForwardsEdgeWeights = new Float32Array(that.typedArrayCache.newForwardsEdgeWeights.buffer, 0, numEdges);
    var newBackwardsEdgeWeights = new Float32Array(that.typedArrayCache.newBackwardsEdgeWeights.buffer, 0, numEdges);
    var newCurPoints = new Float32Array(that.typedArrayCache.newCurPoints.buffer, 0, numPoints * 2);

    var rawSimBuffers = rawdata.buffers.simulator;
    var filteredSimBuffers = that.data.buffers.simulator;

    return Q.all([
        rawSimBuffers.prevForces.read(tempPrevForces),
        rawSimBuffers.springsPos.read(tempSpringsPos),
        rawSimBuffers.forwardsEdgeWeights.read(tempForwardsEdgeWeights),
        rawSimBuffers.backwardsEdgeWeights.read(tempBackwardsEdgeWeights),
        filteredSimBuffers.curPoints.read(tempCurPoints)
    ]).spread(function () {

        ///////////////////////////////////////
        // Update last locations of points
        ///////////////////////////////////////

        var promise;
        // TODO: Move this into general initialization
        if (!that.lastPointPositions) {
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
            _.each(that.lastMasks.point, function (idx, i) {
                that.lastPointPositions[idx*2] = tempCurPoints[i*2];
                that.lastPointPositions[idx*2 + 1] = tempCurPoints[i*2 + 1];
            });

            promise = Q({});
        }

        return promise;

    }).then(function () {

        for (var i = 0; i < masks.point.length; i++) {
            var oldIdx = masks.point[i];
            newPrevForces[i*2] = tempPrevForces[oldIdx*2];
            newPrevForces[i*2 + 1] = tempPrevForces[oldIdx*2 + 1];

            newDegrees[i] = forwardsEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];

            newCurPoints[i*2] = that.lastPointPositions[oldIdx*2];
            newCurPoints[i*2 + 1] = that.lastPointPositions[oldIdx*2 + 1];
        }

        for (var i = 0; i < masks.edge.length; i++) {
            var oldIdx = masks.edge[i];
            newSpringsPos[i*4] = tempSpringsPos[oldIdx*4];
            newSpringsPos[i*4 + 1] = tempSpringsPos[oldIdx*4 + 1];
            newSpringsPos[i*4 + 2] = tempSpringsPos[oldIdx*4 + 2];
            newSpringsPos[i*4 + 3] = tempSpringsPos[oldIdx*4 + 3];

            newForwardsEdgeWeights[i] = tempForwardsEdgeWeights[oldIdx];
            newBackwardsEdgeWeights[i] = tempBackwardsEdgeWeights[oldIdx];
        }

        var someBufferPropertyNames = ['curPoints', 'prevForces', 'degrees', 'forwardsEdges', 'forwardsDegrees',
            'forwardsWorkItems', 'forwardsEdgeStartEndIdxs', 'backwardsEdges',
            'backwardsDegrees', 'backwardsWorkItems', 'backwardsEdgeStartEndIdxs',
            'springsPos', 'forwardsEdgeWeights', 'backwardsEdgeWeights'
        ];
        _.each(someBufferPropertyNames, function (key) {

            newData.buffers.simulator[key] = that.filteredBufferCache.simulator[key];
        });

        var newBuffers = newData.buffers.simulator;
        return Q.all([
            newBuffers.curPoints.write(newCurPoints),
            newBuffers.prevForces.write(newPrevForces),
            newBuffers.degrees.write(newDegrees),
            newBuffers.springsPos.write(newSpringsPos),
            newBuffers.forwardsEdgeWeights.write(newForwardsEdgeWeights),
            newBuffers.backwardsEdgeWeights.write(newBackwardsEdgeWeights),
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
        // Delete all GPU buffers for values.
        var promises = [];
        _.each(['point', 'edge'], function (type) {
            var buffers = that.data.buffers[type];
            _.each(_.keys(buffers), function (name) {
                var buf = buffers[name];
                promises.push(buffers.delete);
                delete buffers[name];
            });
        });

        return Q.all(promises);

    }).then(function () {

        // Just in case, copy over references from raw data to newData
        // This means we don't have to explicitly overwrite everything.

        _.each(_.keys(rawdata.buffers.simulator), function (key) {
            if (newData.buffers.simulator[key] === undefined) {
                newData.buffers.simulator[key] = rawdata.buffers.simulator[key];
            }
        });

        _.each(_.keys(rawdata.localBuffers), function (key) {
            if (newData.localBuffers[key] === undefined) {
                newData.localBuffers[key] = rawdata.localBuffers[key];
            }
        });

        _.each(_.keys(rawdata.numElements), function (key) {
            if (newData.numElements[key] === undefined) {
                newData.numElements[key] = rawdata.numElements[key];
            }
        });

        _.each(_.keys(rawdata.rendererBuffers), function (key) {
            if (newData.rendererBuffers[key] === undefined) {
                newData.rendererBuffers[key] = rawdata.rendererBuffers[key];
            }
        });

        _.each(_.keys(rawdata.hostBuffers), function (key) {
            if (newData.hostBuffers[key] === undefined) {
                newData.hostBuffers[key] = rawdata.hostBuffers[key];
            }
        });

        // Bump versions of every buffer.
        // TODO: Decide if this is really necessary.
        _.each(_.keys(simulator.versions.buffers), function (key) {
            simulator.versions.buffers[key] += 1;
        });

        that.lastMasks.point = unsortedMasks.point || [];
        that.lastMasks.edge = unsortedMasks.edge || [];

    }).then(function () {
        logger.debug('Filter Completed in ' + (Date.now() - start) + ' ms.');
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
 * @param {Number} numElements - prescribe or describe? number present
 */
Dataframe.prototype.load = function (attributes, type, numElements) {

    // Case of loading with no data.
    // if (_.keys(attributes).length === 0) {
    //     return;
    // }

    // TODO: Decoding at the presentation layer.
    // decodeStrings(attributes);
    // decodeDates(attributes);
    console.log(_.keys(attributes));

    var nodeTitleField = getNodeTitleField(attributes);
    var edgeTitleField = getEdgeTitleField(attributes);

    var filteredKeys = _.keys(attributes)
        .filter(function (name) {
            return ['pointColor', 'pointSize', 'pointTitle', 'pointLabel',
                    'edgeLabel', 'edgeTitle', 'edgeHeight', 'degree'].indexOf(name) === -1;
        })
        .filter(function (name) { return name !== nodeTitleField && name !== edgeTitleField; });

    var filteredAttributes = _.pick(attributes, function (value, key) {
        return filteredKeys.indexOf(key) > -1;
    });

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

    attributes.degree = {values: degree, type: 'number'};
    attributes.degree_in = {values: degree_in, type: 'number'};
    attributes.degree_out = {values: degree_out, type: 'number'};
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

    attributes.Source = {values: source, type: 'string'};
    attributes.Destination = {values: destination, type: 'string'};

    // If no title has been set, just make title the index.
    // TODO: Is there a more appropriate place to put this?
    if (!attributes._title) {
        attributes._title = {type: 'string', values: range(numElements)};
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
    // TODO: Generalize
    if (name === 'edgeColors' || name === 'edgeHeights') {
        var sortedBuffer = new buffer.constructor(buffer.length);
        var permutation = this.rawdata.hostBuffers.forwardsEdges.edgePermutationInverseTyped;
        for (var i = 0; i < buffer.length / 2; i++) {
            sortedBuffer[i*2] = buffer[permutation[i]*2];
            sortedBuffer[i*2 + 1] = buffer[permutation[i]*2 +1];
        }
        buffer = sortedBuffer;
    }

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
        throw new Error("Invalid Num Elements: " + type);
    }
    return res;
};

Dataframe.prototype.getAllBuffers = function (type) {
    return this.data.buffers[type];
};


Dataframe.prototype.getLocalBuffer = function (name) {
    var res = this.data.localBuffers[name];
    if (!res) {
        throw new Error("Invalid Local Buffer: " + name);
    }
    return res;
};

Dataframe.prototype.getHostBuffer = function (name) {
    var res = this.data.hostBuffers[name];
    if (!res) {
        throw new Error("Invalid Host Buffer: " + name);
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
    // TODO: Specialize the 'simulator' type case into its own function.
    // It should be treated differently, since we manually load the buffers
    var buffers = this.data.buffers[type];
    var res = buffers[name];
    var that = this;

    if (type === 'simulator') {
        return res;
    }

    if (res) {
        return Q(res);
    } else {
        var data = this.data.attributes[type][name].values;
        var dataType = this.getDataType(name, type);

        if (dataType !== 'number') {
            throw new Error("Attempting to get buffer that is non-numeric");
        }

        var typedData = new Float32Array(data);
        var byteLength = typedData.byteLength;

        return this.simulator.cl.createBuffer(byteLength, '_' + type + '_' + name)
            .then(function (newBuffer) {
                buffers[name] = newBuffer;
                return newBuffer.write(typedData);
            });
    }
}


/** Returns one row object.
 * @param {double} index - which element to extract.
 * @param {string} type - any of [TYPES]{@link TYPES}.
 * @param {Object?} attributes - which attributes to extract from the row.
 */
Dataframe.prototype.getRowAt = function (index, type, attributes) {

    var lastMask = this.lastMasks[type];
    if (lastMask.length > 0) {
        index = lastMask[index];
    }

    attributes = attributes || this.rawdata.attributes[type];
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
    var attributes = this.rawdata.attributes[type],
        that = this;

    indices = indices || range(that.data.numElements[type]);
    // Convert from sorted into unsorted edge indices
    if (indices && type === 'edge') {
        var newIndices = [];
        var forwardsEdgePermutationInverse = this.getHostBuffer('forwardsEdges').edgePermutationInverseTyped;
        _.each(indices, function (v) {
            newIndices.push(forwardsEdgePermutationInverse[v]);
        });
        indices = newIndices;
    }


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
    var attributes = this.rawdata.attributes[type],
        keys = this.getAttributeKeys(type);

    indices = indices || range(that.data.numElements[type]);

    var lastMask = this.lastMasks[type];

    var values = _.map(indices, function (index) {
        if (lastMask.length > 0) {
            index = lastMask[index];
        }
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

/** Answers the type for the column name and type (point/edge). */
Dataframe.prototype.getDataType = function (column, type) {
    // Assumes that types don't change after filtering
    return this.rawdata.attributes[type][column].type;
};

// TODO: Have this return edge attributes in sorted order, unless
// explicitly requested to be unsorted (for internal perf reasons)
Dataframe.prototype.getColumn = function (column, type) {

    // A filter has been done, and we need to apply the
    // mask and compact.
    if (!this.data.attributes[type][column]) {
        var lastMask = this.lastMasks[type];
        var rawAttrs = this.rawdata.attributes[type];
        var newValues = [];
        _.each(lastMask, function (idx) {
            newValues.push(rawAttrs[column].values[idx]);
        });
        this.data.attributes[type][column] = {
            values: newValues,
            type: rawAttrs[column].type,
            target: rawAttrs[column].target
        };
    }

    var attributes = this.data.attributes[type];
    return attributes[column].values;
};


Dataframe.prototype.getAttributeKeys = function (type) {
    // Assumes that filtering doesn't add/remove columns
    // TODO: Generalize so that we can add/remove columns
    return _.sortBy(
        _.keys(this.rawdata.attributes[type]),
        _.identity
    );
};


Dataframe.prototype.getColumnsByType = function () {
    var types = ['point', 'edge'];
    var result = {};
    _.each(types, function (typeName) {
        var typeResult = {};
        var columnNamesPerType = this.getAttributeKeys(typeName);
        _.each(columnNamesPerType, function (columnName) {
            typeResult[columnNamesPerType] = this.getColumn(columnName, typeName);
        });
        result[typeName] = typeResult;
    });
    return result;
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
            toSerialize[type][key] = that.getColumn(key, type);
        });
    });

    serialize(toSerialize, options.compress, target);
};


//////////////////////////////////////////////////////////////////////////////
// Aggregations and Histograms
//////////////////////////////////////////////////////////////////////////////


// [int] * ?[ string ] * ?{string -> ??} * ?{countBy, ??} * {point, edge, undefined}
// -> ??
//undefined type signifies both nodes and edges
Dataframe.prototype.aggregate = function (simulator, indices, attributes, binning, mode, type) {

    var that = this;
    // convert indices for edges from sorted to unsorted;
    if (type === 'edge') {
        var unsortedIndices = [];
        var forwardsEdgePermutationInverse = this.getHostBuffer('forwardsEdges').edgePermutationInverseTyped;
        _.each(indices, function (v) {
            unsortedIndices.push(forwardsEdgePermutationInverse[v]);
        });
        indices = unsortedIndices;
    }

    var process = function (attribute, indices) {

        var goalNumberOfBins = binning ? binning._goalNumberOfBins : 0;
        var binningHint = binning ? binning[attribute] : undefined;
        var dataType = that.getDataType(attribute, type);

        if (mode !== 'countBy' && dataType !== 'string') {
            return that.histogram(simulator, attribute, binningHint, goalNumberOfBins, indices, type);
        } else {
            return that.countBy(simulator, attribute, binningHint, indices, type);
        }
    }

    var validAttributes = this.getAttributeKeys(type);
    var keysToAggregate = attributes ? attributes : validAttributes;

    keysToAggregate = keysToAggregate.filter(function (val) {
        return val[0] !== '_';
    }).filter(function (val) {
        // Make sure that valid attributes were passed in.
        return validAttributes.indexOf(val) > -1;
    });


    var chain = Q(); //simulator.otherKernels.histogramKernel.setIndices(simulator, indices);
    var aggregated = {};

    _.each(keysToAggregate, function (attribute) {
        chain = chain.then(function() {
            return process(attribute, indices)
                .then(function (agg) {
                    aggregated[attribute] = agg;
                });
        });
    });

    return chain.then(function() {
        return aggregated;
    });




    // Array of promises
    // var promisedAggregates = _.map(keysToAggregate, function (attribute) {
    //     return process(attribute, indices);
    // });

    // return Q.all(promisedAggregates).then(function (aggregated) {
    //     var ret = {};
    //     _.each(aggregated, function (agg, idx) {
    //         ret[keysToAggregate[idx]] = agg;
    //     });
    //     return ret;
    // });
};


Dataframe.prototype.countBy = function (simulator, attribute, binning, indices, type) {
    var values = this.getColumn(attribute, type);

    // TODO: Get this value from a proper source, instead of hard coding.
    var maxNumBins = 29;

    if (indices.length === 0) {
        return Q({type: 'nodata'});
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

    return Q({
        type: 'countBy',
        numValues: numValues,
        numBins: _.keys(bins).length,
        bins: bins,
    });
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
        var binWidth = (max - min) / (goalNumberOfBins - 1);

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
        numBins = Math.floor((topVal - bottomVal) / binWidth) + 1;
    }

    // console.log('NUM BINS: ', numBins);
    // console.log('max: ', max, 'min: ', min, 'goalBins: ', goalBins);

    return {
        numBins: numBins,
        binWidth: binWidth,
        minValue: bottomVal,
        maxValue: topVal,
    };
}


Dataframe.prototype.histogram = function (simulator, attribute, binning, goalNumberOfBins, indices, type) {
    // Binning has binWidth, minValue, maxValue, and numBins

    // Disabled because filtering is expensive, and we now have type safety coming from
    // VGraph types.
    // values = _.filter(values, function (x) { return !isNaN(x)});

    var values = this.getColumn(attribute, type);

    var numValues = indices.length;
    if (numValues === 0) {
        return Q({type: 'nodata'});
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

    //var qDataBuffer = this.getBuffer(attribute, type);
    var binStart = new Float32Array(numBins);
    for (var i = 0; i < numBins; i++) {
        binStart[i] = bottomVal + (binWidth * i);
    }

    var dataSize = indices.length;

    var retObj = {
        type: 'histogram',
        numBins: numBins,
        binWidth: binWidth,
        numValues: numValues,
        maxValue: topVal,
        minValue: bottomVal
    };

    // Fast path for case of only one bin.
    if (numBins === 1) {
        _.extend(retObj, {bins: [numValues]});
        return Q(retObj);
    }

    // return qDataBuffer.then(function (dataBuffer) {
    //         return simulator.otherKernels.histogramKernel.run(simulator, numBins, dataSize, dataBuffer, indices, binStart);
    //     }).then(function (bins) {
    //         return _.extend(retObj, {bins: bins});
    //     }).fail(log.makeQErrorHandler(logger, 'Failure trying to run histogramKernel'));

    // Dead code, exists solely for timing.
    // TODO: Make this a config option.

    var bins = Array.apply(null, new Array(numBins)).map(function () { return 0; });

    var binId;
    for (var i = 0; i < indices.length; i++) {
        // Here we use an optimized "Floor" because we know it's a smallish, positive number.
        // TODO: Have to be careful because floating point error.
        // In particular, we need to math math as closely as possible on filters.
        binId = ((values[indices[i]] - bottomVal) / binWidth) | 0;
        bins[binId]++;
    }

    _.extend(retObj, {bins: bins});
    return Q(retObj);
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

/**
 * @param {Array<Number>} values
 * @param {Mask} indices
 * @returns {{max: number, min: Number}}
 */
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

function computeEdgeList(edges, oldEncapsulated, masks, pointOriginalLookup) {

    var edgeListTyped = new Uint32Array(edges.length);
    var mapped = new Uint32Array(edges.length / 2);

    // If we're filtering and have information on unfiltered data.
    if (oldEncapsulated && masks) {
        var oldEdges = oldEncapsulated.edgesTyped;
        var oldPermutation = oldEncapsulated.edgePermutationInverseTyped;
        var lastOldIdx = 0;

        // Lookup to see if an edge is included.
        var edgeLookup = {};
        for (var i = 0; i < edges.length/2; i++) {
            var src = edges[i*2];
            var dst = edges[i*2 + 1];
            if (!edgeLookup[src]) {
                edgeLookup[src] = [];
            }
            edgeLookup[src].push(dst);
        }


        var mappedMaskInverse = new Uint32Array(oldPermutation.length);
        for (var i = 0; i < mappedMaskInverse.length; i++) {
            mappedMaskInverse[i] = 1;
        }

        for (var i = 0; i < edges.length/2; i++) {
            while (lastOldIdx < oldEdges.length/2) {

                var src = pointOriginalLookup[oldEdges[lastOldIdx*2]];
                var dst = pointOriginalLookup[oldEdges[lastOldIdx*2 + 1]];

                if ( edgeLookup[src] && edgeLookup[src].indexOf(dst) > -1 ) {
                    edgeListTyped[i*2] = src;
                    edgeListTyped[i*2 + 1] = dst;
                    mapped[i] = oldPermutation[lastOldIdx];
                    mappedMaskInverse[oldPermutation[lastOldIdx]] = 0;
                    lastOldIdx++;
                    break;
                } else {
                    lastOldIdx++;
                }
            }
        }
        // Compute Scan of mappedMask:
        var mappedScan = new Uint32Array(mappedMaskInverse.length);
        mappedScan[0] = mappedMaskInverse[0];
        for (var i = 1; i < mappedMaskInverse.length; i++) {
            mappedScan[i] = mappedMaskInverse[i] + mappedScan[i-1];
        }

        for (var i = 0; i < mapped.length; i++) {
            var idx = mapped[i];
            mapped[i] = idx - mappedScan[idx];
        }

    // First time through.
    } else {
        var maskedEdgeList = new Float64Array(edgeListTyped.buffer);
        var maskedEdges = new Float64Array(edges.buffer);

        for (var i = 0; i < mapped.length; i++) {
            mapped[i] = i;
        }

        Array.prototype.sort.call(mapped, function (a, b) {
            return edges[a*2] < edges[b*2] ? -1
                    : edges[a*2] > edges[b*2] ? 1
                    : edges[a*2 + 1] - edges[b*2 + 1];
        });

        for (var i = 0; i < edges.length/2; i++) {
            var idx = mapped[i];
            // I believe it's slightly faster to copy it in using a 64 bit "cast"
            // than to do it directly. However, it should be tested more before being enabled.

            // maskedEdgeList[i] = maskedEdges[idx];
            edgeListTyped[i*2] = edges[idx*2];
            edgeListTyped[i*2 + 1] = edges[idx*2 + 1];
        }
    }

    return {
        edgeListTyped: edgeListTyped,
        originals: mapped
    }
}

function computeWorkItemsTyped(edgesTyped, originals, numPoints) {
     // [ [first edge number from src idx, numEdges from source idx, source idx], ... ]
    var workItemsTyped = new Int32Array(numPoints*4);
    var edgeListLastPos = 0;
    var edgeListLastSrc = edgesTyped[0];
    var numEdges = edgesTyped.length / 2;
    for (var i = 0; i < numPoints; i++) {

        // Case where node has edges
        if (edgeListLastSrc === i) {
            var startingIdx = edgeListLastPos;
            var count = 0;
            while (edgeListLastPos < numEdges && edgesTyped[edgeListLastPos*2] === i) {
                count++;
                edgeListLastPos++;
            }
            edgeListLastSrc = edgeListLastPos < numEdges ? edgesTyped[edgeListLastPos*2] : -1;
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

function computeEdgeStartEndIdxs(workItemsTyped, edgesTyped, originals, numPoints) {
    var index = 0;
    var edgeStartEndIdxsTyped = new Uint32Array(numPoints * 2);
    for(var i = 0; i < (workItemsTyped.length/4) - 1; i++) {
      var start = workItemsTyped[i*4];
      if (start == -1) {
        edgeStartEndIdxsTyped[i*2] = -1;
        edgeStartEndIdxsTyped[i*2 + 1] = -1;
      } else {
        var end = workItemsTyped[(i+1)*4];
        var j = i+1;
        while (end < 0 && ((j + 1) < (workItemsTyped.length/4))) {
          end = workItemsTyped[(j + 1)*4];
          j = j + 1;
        }

        if (end === -1) {
            end = edgesTyped.length / 2; // Special case for last workitem
        }
        edgeStartEndIdxsTyped[i*2] = start;
        edgeStartEndIdxsTyped[i*2 + 1] = end;
      }
    }
    if (workItemsTyped[(workItemsTyped.length - 4)] !== -1) {
      edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 2] = workItemsTyped[workItemsTyped.length - 4];
      edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 1] = edgesTyped.length/2;
    } else {
      edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 2] = -1;
      edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 1] = -1;
    }
    return edgeStartEndIdxsTyped;
}


Dataframe.prototype.encapsulateEdges = function (edges, numPoints, oldEncapsulated, masks, pointOriginalLookup) {

    //[[src idx, dest idx, original idx]]
    var edgeListObj = computeEdgeList(edges, oldEncapsulated, masks, pointOriginalLookup);
    var edgesTyped = edgeListObj.edgeListTyped;
    var originals = edgeListObj.originals;

    var edgePermutationInverseTyped = originals;
    // var edgePermutationTyped = originals;
    var edgePermutationTyped = new Uint32Array(edgesTyped.length / 2);
    _.each(edgePermutationInverseTyped, function (val, i) {
        edgePermutationTyped[val] = i;
    });

    // [ [first edge number from src idx, numEdges from source idx, source idx], ... ]
    //workItemsTyped is a Uint32Array [first edge number from src idx, number of edges from src idx, src idx, 666]
    var workItemsTyped = computeWorkItemsTyped(edgesTyped, originals, numPoints);

    var degreesTyped = new Uint32Array(numPoints);
    var srcToWorkItem = new Int32Array(numPoints);

    for (var i = 0; i < numPoints; i++) {
        srcToWorkItem[workItemsTyped[i*4 + 2]] = i;
        degreesTyped[workItemsTyped[i*4 + 2]] = workItemsTyped[i*4 + 1];
    }

    var edgeStartEndIdxsTyped = computeEdgeStartEndIdxs(workItemsTyped, edgesTyped, originals, numPoints);

    return {
        //Uint32Array
        degreesTyped: degreesTyped,

        //Uint32Array [(srcIdx, dstIdx), ...]
        //(edges ordered by src idx)
        edgesTyped: edgesTyped,

        //Uint32Array [where unsorted edge now sits]
        // map original idx -> new idx
        edgePermutation: edgePermutationTyped,

        //Uint32Array [where sorted edge used to it]
        // map new idx -> original idx
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

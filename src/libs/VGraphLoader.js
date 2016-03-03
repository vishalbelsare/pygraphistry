'use strict';

var Q = require('q');
var _ = require('underscore');
var pb = require('protobufjs');
var path = require('path');
var moment = require('moment');
var Color = require('color');

var util = require('../util.js');
var weakcc = require('../weaklycc.js');
var palettes = require('../palettes.js');
var clientNotification = require('../clientNotification.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz', 'graph-viz/js/libs/VGraphLoader.js');
var perf        = require('common/perfStats.js').createPerfMonitor();

// var builder = pb.loadProtoFile(path.resolve(__dirname, 'graph_vector.proto'));
// var graphVectorProtoPath = require.resolve('graph-viz/src/libs/graph_vector.proto');
var graphVectorProtoPath = path.resolve(__dirname, '../../src/libs/graph_vector.proto');
var builder = pb.loadProtoFile(graphVectorProtoPath);
if (builder === null) {
    logger.die('Could not find protobuf definition');
}
var pb_root = builder.build();

var VERTEX = pb_root.VectorGraph.AttributeTarget.VERTEX;
var EDGE   = pb_root.VectorGraph.AttributeTarget.EDGE;

var decoders = {
    0: decode0,
    1: decode1
};

/** @typedef {ProtoBuf.Message} VectorGraph
 */

/** @typedef {Object} AttributeLoader
 * @property {Function} load
 * @property {String[]} type
 * @property {Function} default
 * @property {Number} target VERTEX or EDGE
 * @property values
 */

/** introduce mapping names, and for each, how to send mapped buffer to NBody.js
 * @param graph
 * @returns {Object.<AttributeLoader>}
 */
var attributeLoaders = function(graph) {
    return {
        pointSize: {
            load: graph.setSizes,
            type : ['number'],
            default: graph.setSizes,
            target: VERTEX,
            values: undefined
        },
        pointColor: {
            load: graph.setColors,
            type: ['number', 'color'],
            default: graph.setColors,
            target: VERTEX,
            values: undefined
        },
        edgeColor: {
            load: graph.setEdgeColors,
            type: ['number', 'color'],
            default: graph.setEdgeColors,
            target: EDGE,
            values: undefined
        },
        edgeHeight: {
            load: graph.setEdgeHeights,
            type: ['number'],
            default: graph.setEdgeHeights,
            target: EDGE,
            values: undefined
        },
        midEdgeColor: {
            load: graph.setMidEdgeColors,
            type: ['number', 'color'],
            default: graph.setMidEdgeColors,
            target: EDGE,
            values: undefined
        },
        pointLabel: {
            load: graph.setPointLabels,
            type: ['string'],
            target: VERTEX,
            values: undefined
        },
        edgeLabel: {
            load: graph.setEdgeLabels,
            type: ['string'],
            target: EDGE,
            values: undefined
        },
        edgeWeight: {
          load: graph.setEdgeWeight,
          type: ['number'],
          target: EDGE,
          default: graph.setEdgeWeight,
          values: undefined
        },
        // PointTitle and edgeTitle are handled in their own special way.
        // They are loaded outside of the loader mechanism
        // Without these two dummy entries, decode1 would discard encodings for
        // PointTitle and edgeTitle as invalid.
        pointTitle: {
            load: function () { return Q(); },
            type: ['string'],
            target: VERTEX,
            default: function () { return Q(); }
        },
        edgeTitle: {
            load: function () { return Q(); },
            type: ['string'],
            target: EDGE,
            default: function () { return Q(); }

        }
    };
};


var opentsdbMapper = {
    mappings: {
        pointSize: {
            name: 'degree',
            transform: function (v) {
                return normalize(logTransform(v), 5, Math.pow(2, 8));
            }
        },
        pointTitle: {
            name: 'label'
        },
        pointColor: {
            name: 'community_spinglass',
            transform: function (v) {
                var palette = util.palettes.qual_palette2;
                return util.int2color(normalize(v, 0, palette.length - 1), palette);
            }
        },
        edgeColor: {
            name: 'bytes',
            transform: function (v) {
                var palette = util.palettes.green2red_palette;
                return util.int2color(normalize(logTransform(v), 0, palette.length - 1), palette);
            }
        },
        edgeWeight: {
            name: 'weight',
            transform: function (v) {
                return normalizeFloat(logTransform(v), 0.5, 1.5);
            }
        }
    }
};


var misMapper = {
    mappings: _.extend({}, opentsdbMapper.mappings, {
        pointSize: {
            name: 'betweeness',
            transform: function (v) {
                return normalize(v, 5, Math.pow(2, 8));
            }
        }
    })
};


var defaultMapper = {
    mappings: {
        pointSize: {
            name: 'pointSize',
            transform: function (v) {
                return normalize(v, 5, Math.pow(2, 8));
            }
        },
        pointLabel: {
            name: 'pointLabel'
        },
        edgeLabel: {
            name: 'edgeLabel'
        },
        pointColor: {
            name: 'pointColor',
            transform: function (v) {
                return _.map(v, function (cat) {
                    return palettes.bindings[cat];
                });
            }
        },
        edgeColor: {
            name: 'edgeColor',
            transform: function (v) {
                return _.map(v, function (cat) {
                    return palettes.bindings[cat];
                });
            }
        },
        edgeHeight: {
            name: 'edgeHeight'
        },
        edgeWeight: {
            name: 'edgeWeight',
            transform: function (v) {
                return normalizeFloat(v, 0.5, 1.5);
            }
        }
    }
};


var mappers = {
    'opentsdb': opentsdbMapper,
    'miserables': misMapper,
    'splunk': defaultMapper,
    'default': defaultMapper
};


function wrap(mappings, loaders) {
    var res = {};
    for (var a in loaders) {
        if (a in mappings) {
            var loader = loaders[a];
            var mapping = mappings[a];

            // Helper function to work around dubious JS scoping
            doWrap(res, mapping, loader);

            logger.trace('Mapping ' + mapping.name + ' to ' + a);
        } else {
            res[a] = [loaders[a]];
        }
    }
    return res;
}


function doWrap(res, mapping, loader) {
    var mapped = res[mapping.name] || [];

    if ('transform' in mapping) {
        var oldLoad = loader.load;
        loader.load = function (data) {
            return oldLoad(mapping.transform(data));
        };
    }

    mapped.push(loader);
    res[mapping.name] = mapped;
}


function runLoaders(loaders) {
    var promises = _.map(loaders, function (loaderArray) {
        return _.map(loaderArray, function (loader) {
            if (loader.values) {
                return loader.load(loader.values);
            } else if (loader.default) {
                return loader.default();
            } else {
                return Q();
            }
        });
    });
    var flatPromises = _.flatten(promises, true);
    return Q.all(flatPromises);
}


/**
 * Load the raw data from the dataset object from S3
**/
function load(graph, dataset) {
    var vg = pb_root.VectorGraph.decode(dataset.body);
    logger.trace('attaching vgraph to simulator');
    graph.simulator.vgraph = vg;
    return decoders[vg.version](graph, vg, dataset.metadata);
}

/** @typedef {Object} DataframeMetadataByColumn
 * @property {String} ctype
 * @property {String} userType
 * @property {String} originalType
 * @property {Aggregations} aggregations
 */

/** @typedef {Object} EncodingSpec
 * @property {String[]} attributes
 */

/** @typedef {Object} DataframeMetadataByComponent
 * @property {Object.<DataframeMetadataByColumn>} attributes
 * @property {Number} count
 * @property {Object.<EncodingSpec>} encodings
 */

/** @typedef {Object} DataframeMetadata
 * @property {DataframeMetadataByComponent[]} nodes
 * @property {DataframeMetadataByComponent[]} edges
 */

/** @typedef {Object} AttrObject
 * @property {String} name
 * @property {Number} target
 * @property {String} type
 * @property {Array} values
 */


/**
 * @param {Dataframe} dataframe
 * @param {AttrObject[]} attributeObjects
 * @param {Number} numPoints
 * @param {Number} numEdges
 * @param {Object} aliases column names by encoding.
 * @param {DataframeMetadata} graphInfo
 */
function loadDataframe(dataframe, attributeObjects, numPoints, numEdges, aliases, graphInfo) {
    var edgeAttributeObjects = _.filter(attributeObjects, function (value) {
        return value.target === EDGE;
    });
    var pointAttributeObjects = _.filter(attributeObjects, function (value) {
        return value.target === VERTEX;
    });

    var edgeAttributeObjectsByName = _.object(_.map(edgeAttributeObjects, function (value) {
        return [value.name, value];
    }));

    var pointAttributeObjectsByName = _.object(_.map(pointAttributeObjects, function (value) {
        return [value.name, value];
    }));

    _.extend(dataframe.bufferAliases, aliases);
    _.extend(dataframe.metadata, graphInfo);
    dataframe.loadAttributesForType(edgeAttributeObjectsByName, 'edge', numEdges);
    dataframe.loadAttributesForType(pointAttributeObjectsByName, 'point', numPoints);
}


function decode0(graph, vg, metadata)  {
    logger.debug('Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)',
          vg.version, vg.name, vg.vertexCount, vg.edgeCount);

    notifyClientOfSizesForAllocation(graph.socket, vg.edgeCount, vg.vertexCount);

    var attrs = getAttributes0(vg);
    loadDataframe(graph.dataframe, attrs, vg.vertexCount, vg.edgeCount, {}, {});
    logger.info({attributes: _.pluck(attrs, 'name')}, 'Successfully loaded dataframe');

    var edges = new Array(vg.edgeCount);
    var dimensions = [1, 1];

    for (var i = 0; i < vg.edges.length; i++) {
        var e = vg.edges[i];
        edges[i] = [e.src, e.dst];
    }

    var vertices = lookupInitialPosition(vg, attrs);

    if (vertices === undefined) {
        clientNotification.loadingStatus(graph.socket, 'Initializing positions');
        vertices = computeInitialPositions(vg.vertexCount, edges, dimensions, graph.socket);
    }

    var loaders = attributeLoaders(graph);
    var mapper = mappers[metadata.mapper];
    if (!mapper) {
        logger.warn('Unknown mapper', metadata.mapper, 'using "default"');
        mapper = mappers['default'];
    }
    loaders = wrap(mapper.mappings, loaders);
    logger.trace('Attribute loaders:', loaders);

    _.each(attrs, function (attr) {
        var vname = attr.name;
        if (!(vname in loaders)) {
            logger.debug('Skipping unmapped attribute', vname);
            return;
        }

        var loaderArray = loaders[vname];

        _.each(loaderArray, function (loader) {
            if (attr.target !== loader.target) {
                logger.warn('Vertex/Node attribute mismatch for ' + vname);
            } else if (!_.contains(loader.type, attr.type)) {
                logger.warn('Expected type in ' + loader.type + ', but got ' + attr.type + ' for ' + vname);
            } else {
                loader.values = attr.values;
            }
        });

    });

    return clientNotification.loadingStatus(graph.socket, 'Binding nodes')
        .then(function () {
            return graph.setVertices(vertices);
        }).then(function () {
            return clientNotification.loadingStatus(graph.socket, 'Binding edges');
        }).then(function () {
            return graph.setEdges(edges);
        }).then(function () {
            return clientNotification.loadingStatus(graph.socket, 'Binding everything else');
        }).then(function () {
            return runLoaders(loaders);
        }).then(function () {
            return graph;
        }).fail(log.makeQErrorHandler(logger, 'Failure in VGraphLoader'));
}


function computeInitialPositions(vertexCount, edges, dimensions) {
    logger.trace('Running component analysis');

    var components = weakcc(vertexCount, edges, 2);
    var numComponents = components.components.length;
    var pointsPerRow = vertexCount / (Math.round(Math.sqrt(numComponents)) + 1);

    perf.startTiming('graph-viz:data:vgraphloader, weakcc postprocess');
    var componentOffsets = [];
    var cumulativePoints = 0;
    var row = 0;
    var col = 0;
    var pointsInRow = 0;
    var maxPointsInRow = 0;
    var rowYOffset = 0;
    var vertices = [];

    var i, component;
    for (i = 0; i < numComponents; i++) {
        component = components.components[i];
        maxPointsInRow = Math.max(maxPointsInRow, component.size);

        componentOffsets.push({
            rollingSum: cumulativePoints,
            rowYOffset: rowYOffset,
            rowRollingSum: pointsInRow,
            rollingMaxInRow: maxPointsInRow,
            row: row,
            col: col
        });

        cumulativePoints += component.size;
        if (pointsInRow > pointsPerRow) {
            row++;
            rowYOffset += maxPointsInRow;
            col = 0;
            pointsInRow = 0;
            maxPointsInRow = 0;
        } else {
            col++;
            pointsInRow += component.size;
        }
    }
    for (i = numComponents - 1; i >= 0; i--) {
        component = components.components[i];
        component.rowHeight =
            Math.max(component.size,
                i + 1 < numComponents &&
                components.components[i+1].row === component.row ?
                    component.rollingMaxInRow :
                    0);
    }

    var initSize = 5 * Math.sqrt(vertexCount);
    for (i = 0; i < vertexCount; i++) {
        var c = components.nodeToComponent[i];
        var offset = componentOffsets[c];
        var vertex = [ initSize * (offset.rowRollingSum + 0.9 * components.components[c].size * Math.random()) / vertexCount ];
        for (var j = 1; j < dimensions.length; j++) {
            vertex.push(initSize * (offset.rowYOffset + 0.9 * components.components[c].size * Math.random()) / vertexCount);
        }
        vertices.push(vertex);
    }
    perf.endTiming('graph-viz:data:vgraphloader, weakcc postprocess');
    return vertices;
}


/**
 * @param {VectorGraph} vg
 * @param {AttrObject[]} vectors
 * @returns {Array.<Array.<Number>>}
 */
function lookupInitialPosition(vg, vectors) {
    var x = _.find(vectors, function (o) { return o.name === 'x'; });
    var y = _.find(vectors, function (o) { return o.name === 'y'; });

    if (x && y) {
        logger.trace('Loading previous vertices from xObj');
        var vertices = new Array(vg.vertexCount);
        for (var i = 0; i < vg.vertexCount; i++) {
            vertices[i] = [x.values[i], y.values[i]];
        }
        return vertices;
    } else {
        return undefined;
    }
}


function getVectors0(vg) {
    return vg.string_vectors.concat(vg.uint32_vectors,
                                    vg.int32_vectors,
                                    vg.double_vectors);
}

function castToMoment (value) {
    var momentVal;
    if (typeof(value) === 'number') {
        // First attempt unix seconds constructor
        momentVal = moment.unix(value);

        // If not valid, or unreasonable year, try milliseconds constructor
        if (!momentVal.isValid() || momentVal.year() > 5000 || momentVal.year() < 500) {
            momentVal = moment(value);
        }

    } else {
        momentVal = moment(value);
    }

    return momentVal;
}

function dateAsNumber (val) {
    var date = castToMoment(val);
    return date.valueOf(); // Represent date as a number
}


/**
 * @param {VectorGraph} vg
 * @returns {AttrObject[]}
 */
function getAttributes0(vg) {
    var vectors = getVectors0(vg);
    var attributeObjects = [];

    for (var i = 0; i < vectors.length; i++) {
        var v = vectors[i];
        if (v.values.length > 0) {
            var type = typeof(v.values[0]);

            // Attempt to infer date types when possible
            // Check if name contains time or date
            if ((/time/i).test(v.name) || (/date/i).test(v.name)) {
                logger.debug('Attempting to cast ' + v.name + ' to a moment object.');
                var testMoment = castToMoment(v.values[0]);
                var isValidMoment = testMoment.isValid();

                if (isValidMoment) {
                    logger.debug('Successfully cast ' + v.name + ' as a moment.');
                    type = 'date';

                    var newValues = v.values.map(dateAsNumber);
                    v.values = newValues;

                } else {
                    logger.debug('Failed to cast ' + v.name + ' as a moment.');
                }
            }

            if ((/color/i).test(v.name)) {
                var isValidColor = false, sampleValue = v.values[0];
                if (type === 'number') {
                    if (sampleValue > 0 && sampleValue <= 0xFFFFFFFF) {
                        isValidColor = true;
                    }
                } else if (type === 'string') {
                    try {
                        var testColor = new Color(sampleValue);
                        isValidColor = testColor !== undefined && testColor.rgbaString() !== undefined;
                    } catch (e) {
                        logger.debug('Failed to cast ' + v.name + ' as a color: ' + e.message);
                    }
                }
                if (isValidColor) {
                    type = 'color';
                } else {
                    logger.debug('Failed to cast ' + v.name + ' as a color.');
                }
            }

            attributeObjects.push({
                name: v.name,
                target : v.target,
                type: type,
                values: v.values
            });
        }
    }

    return attributeObjects;
}


function logTransform(values) {
    return _.map(values, function (val) {
        return val <= 0 ? 0 : Math.log(val);
    });
}


// rescale array of [a,b] range values to [minimum, maximum]
function normalize(array, minimum, maximum) {
    var max = _.max(array);
    var min = _.min(array);
    var scaleFactor = (maximum - minimum) / (max - min + 1);

    return _.map(array, function (val) {
        return minimum + Math.floor((val - min) * scaleFactor);
    });
}


// rescale array of [a,b] range value to [minimum, maximum] with floats
function normalizeFloat(array, minimum, maximum) {
    var max = _.max(array);
    var min = _.min(array);
    var scaleFactor = (maximum - minimum) / (max - min + 1);

    return _.map(array, function (val) {
        return minimum + (val - min) * scaleFactor;
    });
}

/**
 * @param {VectorGraph} vg
 * @returns {any[]}
 */
function getVectors1(vg) {
    return _.flatten([
            vg.uint32_vectors, vg.int32_vectors, vg.int64_vectors,
            vg.float_vectors, vg.double_vectors,
            vg.string_vectors, vg.bool_vectors
        ], false);
}

/**
 * @param {VectorGraph} vg
 * @returns {{nodes: Object.<AttrObject>, edges: Object.<AttrObject>}}
 */
function getAttributes1(vg) {
    var vectors = getVectors1(vg);
    var nodeAttributeObjects = {};
    var edgeAttributeObjects = {};

    _.each(vectors, function (v) {
        if (v.values.length > 0) {
            var attributeObjects = v.target === VERTEX ? nodeAttributeObjects : edgeAttributeObjects;
            attributeObjects[v.name] = {
                name: v.name,
                target : v.target,
                type: typeof(v.values[0]),
                values: v.values
            };
        }
    });

    return {
        nodes: nodeAttributeObjects,
        edges: edgeAttributeObjects
    };
}


function sameKeys(o1, o2){
    var k1 = _.keys(o1);
    var k2 = _.keys(o2);
    var ki = _.intersection(k1, k2);
    return k1.length === k2.length && k2.length === ki.length;
}

/** These encodings are handled in their own special way. */
var GraphShapeProperties = ['source', 'destination', 'nodeId'];

/**
 * @param {Object.<EncodingSpec>} encodings
 * @param {Object.<AttributeLoader>} loaders
 * @param {Number} target VERTEX or EDGE
 * @returns {Object.<DataframeMetadataByColumn>}
 */
function getSimpleEncodings(encodings, loaders, target) {

    var supportedEncodings = _.pick(encodings, function (enc, graphProperty) {
        if (_.contains(GraphShapeProperties, graphProperty)) {
            return false;
        }

        if (!(graphProperty in loaders)) {
            console.warn('In encodings, unknown graph property:', graphProperty);
            return false;
        }

        if (!_.all(loaders[graphProperty], function (loader) { return loader.target === target; })) {
            console.warn('Wrong target type (node/edge) for graph property', graphProperty);
            return false;
        }
        if (enc.attributes.length !== 1) {
            console.warn('Support for multiple attributes not implemented yet for', graphProperty);
            return false;
        }
        return true;
    });

    return _.object(_.map(supportedEncodings, function (enc, graphProperty) {
        return [graphProperty, enc.attributes[0]];
    }));
}


/**
 * @param {DataframeMetadata} metadata
 * @param {VectorGraph} vg
 * @param {{nodes: Object.<AttrObject>, edges: Object.<AttrObject>}} vgAttributes
 * @returns {{nodes: *, edges: *}}
 */
function checkMetadataAgainstVGraph(metadata, vg, vgAttributes) {
    if (metadata.nodes.length === 0 || metadata.edges.length === 0) {
        throw new Error('Nodes or edges missing!');
    }

    if (metadata.nodes.length > 1 || metadata.edges.length > 1) {
        throw new Error('K-partite graphs support not implemented yet!');
    }

    var nodesMetadata = metadata.nodes[0];
    var edgesMetadata = metadata.edges[0];

    logger.debug('Node attributes metadata:', nodesMetadata.attributes);
    logger.debug('Edge attributes metadata:', edgesMetadata.attributes);
    logger.debug('VGraph has node attributes:', _.pluck(vgAttributes.nodes, 'name'));
    logger.debug('VGraph has edge attributes:', _.pluck(vgAttributes.edges, 'name'));

    if (!sameKeys(nodesMetadata.attributes, vgAttributes.nodes) ||
        !sameKeys(edgesMetadata.attributes, vgAttributes.edges)) {
        throw new Error('Discrepancies between metadata and VGraph attributes');
    }
    if (nodesMetadata.count !== vg.vertexCount || edgesMetadata.count !== vg.edgeCount) {
        throw new Error('Discrepancies in number of nodes/edges between metadata and VGraph');
    }

    return {
        'nodes': nodesMetadata,
        'edges': edgesMetadata
    };
}


/**
 * @param graph
 * @param {VectorGraph} vg
 * @param {DataframeMetadata} metadata
 * @returns {Promise<U>}
 */
function decode1(graph, vg, metadata)  {
    logger.debug('Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)',
                 vg.version, vg.name, vg.vertexCount, vg.edgeCount);

    var vgAttributes = getAttributes1(vg);
    var graphInfo = checkMetadataAgainstVGraph(metadata, vg, vgAttributes);
    notifyClientOfSizesForAllocation(graph.socket, vg.edgeCount, vg.vertexCount);

    var edges = new Array(vg.edgeCount);
    for (var i = 0; i < vg.edges.length; i++) {
        var e = vg.edges[i];
        edges[i] = [e.src, e.dst];
    }
    // TODO Check if x/y are bound in graphInfo.nodes.encodings
    var dimensions = [1, 1];

    var vertices = lookupInitialPosition(vg, _.values(vgAttributes.nodes));
    if (vertices === undefined) {
        clientNotification.loadingStatus(graph.socket, 'Initializing positions');
        vertices = computeInitialPositions(vg.vertexCount, edges, dimensions, graph.socket);
    }

    var loaders = attributeLoaders(graph);
    var mapper = mappers[metadata.mapper];
    if (!mapper) {
        logger.warn('Unknown mapper', metadata.mapper, 'using "default"');
        mapper = mappers['default'];
    }
    loaders = wrap(mapper.mappings, loaders);
    logger.trace('Attribute loaders:', loaders);

    var nodeEncodings = getSimpleEncodings(graphInfo.nodes.encodings, loaders, VERTEX);
    var edgeEncodings = getSimpleEncodings(graphInfo.edges.encodings, loaders, EDGE);


    var flatAttributeArray = _.values(vgAttributes.nodes).concat(_.values(vgAttributes.edges));
    var allEncodings =  _.extend({}, nodeEncodings, edgeEncodings);
    loadDataframe(graph.dataframe, flatAttributeArray, vg.vertexCount, vg.edgeCount, allEncodings, graphInfo);

    _.each(loaders, function (loaderArray, graphProperty) {
        _.each(loaderArray, function (loader) {
            var encodings = loader.target === VERTEX ? nodeEncodings : edgeEncodings;
            var attributes = loader.target === VERTEX ? vgAttributes.nodes : vgAttributes.edges;
            if (graphProperty in encodings) {
                var attributeName = encodings[graphProperty];
                logger.debug('Loading values for', graphProperty, 'from attribute', attributeName);
                loader.values = attributes[attributeName].values;
            } else {
                logger.debug('Loading default values for', graphProperty);
            }
        });
    });

    return clientNotification.loadingStatus(graph.socket, 'Binding nodes')
        .then(function () {
            return graph.setVertices(vertices);
        }).then(function () {
            return clientNotification.loadingStatus(graph.socket, 'Binding edges');
        }).then(function () {
            return graph.setEdges(edges);
        }).then(function () {
            return clientNotification.loadingStatus(graph.socket, 'Binding everything else');
        }).then(function () {
            return runLoaders(loaders);
        }).then(function () {
            return graph;
        }).fail(log.makeQErrorHandler(logger, 'Failure in VGraphLoader'));
}

function notifyClientOfSizesForAllocation (socket, edgeCount, vertexCount) {
    var MAX_SIZE_TO_ALLOCATE = 2000000;
    var numElements = {
        edge: Math.min(edgeCount, MAX_SIZE_TO_ALLOCATE),
        point: Math.min(vertexCount, MAX_SIZE_TO_ALLOCATE)
    };
    socket.emit('sizes_for_memory_allocation', numElements);
}


module.exports = {
    load: load
};

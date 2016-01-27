'use strict';

var Q = require('q');
var _ = require('underscore');
var pb = require('protobufjs');
var path = require('path');

var util = require('../util.js');
var weakcc = require('../weaklycc.js');
var palettes = require('../palettes.js');
var clientNotification = require('../clientNotification.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:data:vgraphloader');
var perf        = require('common/perfStats.js').createPerfMonitor();


var builder = pb.loadProtoFile(path.resolve(__dirname, 'graph_vector.proto'));
if (builder === null) {
    logger.die('Could not find protobuf definition');
}
var pb_root = builder.build();

var VERTEX = pb_root.VectorGraph.AttributeTarget.VERTEX;
var EDGE   = pb_root.VectorGraph.AttributeTarget.EDGE;

var decoders = {
    0: decode0,
    1: decode1
}


//introduce mapping names, and for each, how to send mapped buffer to NBody.js
var attributeLoaders = function(graph) {
    return {
        pointTag: {
            load: graph.setPointTags,
            type: 'number',
            default: graph.setPointTags,
            target: VERTEX,
            values: undefined
        },
        edgeTag: {
            load: graph.setEdgeTags,
            type: 'number',
            default: graph.setEdgeTags,
            target: EDGE,
            values: undefined
        },
        pointSize: {
            load: graph.setSizes,
            type : 'number',
            default: graph.setSizes,
            target: VERTEX,
            values: undefined
        },
        pointColor: {
            load: graph.setColors,
            type: 'number',
            default: graph.setColors,
            target: VERTEX,
            values: undefined
        },
        edgeColor: {
            load: graph.setEdgeColors,
            type: 'number',
            default: graph.setEdgeColors,
            target: EDGE,
            values: undefined
        },
        edgeHeight: {
            load: graph.setEdgeHeights,
            type: 'number',
            default: graph.setEdgeHeights,
            target: EDGE,
            values: undefined
        },
        midEdgeColor: {
            load: graph.setMidEdgeColors,
            type: 'number',
            default: graph.setMidEdgeColors,
            target: EDGE,
            values: undefined
        },
        pointLabel: {
            load: graph.setPointLabels,
            type: 'string',
            target: VERTEX,
            values: undefined
        },
        edgeLabel: {
            load: graph.setEdgeLabels,
            type: 'string',
            target: EDGE,
            values: undefined
        },
        edgeWeight: {
          load: graph.setEdgeWeight,
          type: 'number',
          target: EDGE,
          default: graph.setEdgeWeight,
          values: undefined
        },
        // PoinTitle and edgeTitle are handled in their own special hacky way.
        // They are loaded outside of the loader mechanism
        // Without these two dummy entries, decode1 would discard encodings for
        // PointTitle and edgeTitle as invalid.
        pointTitle: {
            load: function () { return Q(); },
            type: 'string',
            target: VERTEX,
            default: function () { return Q(); }
        },
        edgeTitle: {
            load: function () { return Q(); },
            type: 'string',
            target: EDGE,
            default: function () { return Q(); }

        }
    };
}


var opentsdbMapper = {
    mappings: {
        pointTag: {
            name: 'nodeTag'
        },
        edgeTag: {
            name: 'edgeTag'
        },
        pointSize: {
            name: 'degree',
            transform: function (v) {
                return normalize(logTransform(v), 5, Math.pow(2, 8))
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
                return normalizeFloat(logTransform(v), 0.5, 1.5)
            }
        }
    },
}


var misMapper = {
    mappings: _.extend({}, opentsdbMapper.mappings, {
        pointSize: {
            name: 'betweeness',
            transform: function (v) {
                return normalize(v, 5, Math.pow(2, 8))
            }
        }
    })
}


var defaultMapper = {
    mappings: {
        pointSize: {
            name: 'pointSize',
            transform: function (v) {
                return normalize(v, 5, Math.pow(2, 8))
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
        pointTag: {
            name: 'pointType',
            transform: function (v) {
                return normalize(v, 0, 2);
            }
        },
        edgeTag: {
            name: 'edgeType',
            transform: function (v) {
                return normalize(v, 0, 2);
            }
        },
        edgeWeight: {
            name: 'edgeWeight',
            transform: function (v) {
                return normalizeFloat(v, 0.5, 1.5)
            }
        }
    }
}


var mappers = {
    'opentsdb': opentsdbMapper,
    'miserables': misMapper,
    'splunk': defaultMapper,
    'default': defaultMapper
}


function wrap(mappings, loaders) {
    var res = {}
    for (var a in loaders) {
        if (a in mappings) {
            var loader = loaders[a];
            var mapping = mappings[a];

            // Helper function to work around dubious JS scoping
            doWrap(res, mapping, loader);

            logger.trace('Mapping ' + mapping.name + ' to ' + a);
        } else
            res[a] = [loaders[a]];
    }
    return res;
}


function doWrap(res, mapping, loader) {
    var mapped = res[mapping.name] || [];

    if ('transform' in mapping) {
        var oldLoad = loader.load;
        loader.load = function (data) {
            return oldLoad(mapping.transform(data));
        }
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


function loadDataframe(graph, attrs, numPoints, numEdges, aliases, graphInfo) {
    var edgeAttrsList = _.filter(attrs, function (value) {
        return value.target === EDGE;
    });
    var pointAttrsList = _.filter(attrs, function (value) {
        return value.target === VERTEX;
    });

    var edgeAttrs = _.object(_.map(edgeAttrsList, function (value) {
        return [value.name, value];
    }));

    var pointAttrs = _.object(_.map(pointAttrsList, function (value) {
        return [value.name, value];
    }));

    _.extend(graph.dataframe.bufferAliases, aliases);
    _.extend(graph.dataframe.metadata, graphInfo);
    graph.dataframe.load(edgeAttrs, 'edge', numEdges);
    graph.dataframe.load(pointAttrs, 'point', numPoints);
}


function decode0(graph, vg, metadata)  {
    logger.debug('Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)',
          vg.version, vg.name, vg.nvertices, vg.nedges);

    notifyClientOfSizesForAllocation(graph.socket, vg.nedges, vg.nvertices);

    var attrs = getAttributes0(vg);
    loadDataframe(graph, attrs, vg.nvertices, vg.nedges, {}, {});
    logger.debug('Graph has attribute: %o', _.pluck(attrs, 'name'));

    var edges = new Array(vg.nedges);
    var dimensions = [1, 1];

    for (var i = 0; i < vg.edges.length; i++) {
        var e = vg.edges[i];
        edges[i] = [e.src, e.dst];
    }

    var vertices = lookupInitialPosition(vg, attrs);

    if (vertices === undefined) {
        clientNotification.loadingStatus(graph.socket, 'Initializing positions');
        vertices = computeInitialPositions(vg.nvertices, edges, dimensions, graph.socket);
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
            if (attr.target != loader.target) {
                logger.warn('Vertex/Node attribute mismatch for ' + vname);
            } else if (attr.type != loader.type) {
                logger.warn('Expected type ' + loader.type + ' but got ' + attr.type + ' for ' + vname);
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


function computeInitialPositions(nvertices, edges, dimensions) {
    logger.trace('Running component analysis');

    var components = weakcc(nvertices, edges, 2);
    var pointsPerRow = nvertices / (Math.round(Math.sqrt(components.components.length)) + 1);

    perf.startTiming('graph-viz:data:vgraphloader, weakcc postprocess');
    var componentOffsets = [];
    var cumulativePoints = 0;
    var row = 0;
    var col = 0;
    var pointsInRow = 0;
    var maxPointsInRow = 0;
    var rowYOffset = 0;
    var vertices = [];

    for (var i = 0; i < components.components.length; i++) {
        maxPointsInRow = Math.max(maxPointsInRow, components.components[i].size);

        componentOffsets.push({
            rollingSum: cumulativePoints,
            rowYOffset: rowYOffset,
            rowRollingSum: pointsInRow,
            rollingMaxInRow: maxPointsInRow,
            row: row,
            col: col
        });

        cumulativePoints += components.components[i].size;
        if (pointsInRow > pointsPerRow) {
            row++;
            rowYOffset += maxPointsInRow;
            col = 0;
            pointsInRow = 0;
            maxPointsInRow = 0;
        } else {
            col++;
            pointsInRow += components.components[i].size;
        }
    }
    for (var i = components.components.length - 1; i >= 0; i--) {
        components.components[i].rowHeight =
            Math.max(components.components[i].size,
                i + 1 < components.components.length
                && components.components[i+1].row == components.components[i].row ?
                    components.components[i].rollingMaxInRow :
                    0);
    }

    var initSize = 5 * Math.sqrt(nvertices);
    for (var i = 0; i < nvertices; i++) {
        var c = components.nodeToComponent[i];
        var offset = componentOffsets[c];
        var vertex = [ initSize * (offset.rowRollingSum + 0.9 * components.components[c].size * Math.random()) / nvertices ];
        for (var j = 1; j < dimensions.length; j++) {
            vertex.push(initSize * (offset.rowYOffset + 0.9 * components.components[c].size * Math.random()) / nvertices);
        }
        vertices.push(vertex);
    }
    perf.endTiming('graph-viz:data:vgraphloader, weakcc postprocess');
    return vertices;
}


function lookupInitialPosition(vg, vectors) {
    var x = _.find(vectors, function (o) { return o.name === 'x'; });
    var y = _.find(vectors, function (o) { return o.name === 'y'; });

    if (x && y) {
        logger.trace('Loading previous vertices from xObj');
        var vertices = new Array(vg.nvertices);
        for (var i = 0; i < vg.nvertices; i++) {
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


function getAttributes0(vg) {
    var vectors = getVectors0(vg);
    var attrs = [];
    for (var i = 0; i < vectors.length; i++) {
        var v = vectors[i];
        if (v.values.length > 0) {
            attrs.push({
                name: v.name,
                target : v.target,
                type: typeof(v.values[0]),
                values: v.values
            });
        }
    }
    return attrs;
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


function getVectors1(vg) {
    return _.flatten([
            vg.uint32_vectors, vg.int32_vectors, vg.int64_vectors,
            vg.float_vectors, vg.double_vectors,
            vg.string_vectors, vg.bool_vectors
        ], false);
}


function getAttributes1(vg) {
    var vectors = getVectors1(vg);
    var nattrs = {};
    var eattrs = {};

    _.each(vectors, function (v) {
        if (v.values.length > 0) {
            var attrs = v.target === VERTEX ? nattrs : eattrs;
            attrs[v.name] = {
                name: v.name,
                target : v.target,
                type: typeof(v.values[0]),
                values: v.values
            };
        }
    });

    return {
        nodes: nattrs,
        edges: eattrs
    };
}


function sameKeys(o1, o2){
    var k1 = _.keys(o1);
    var k2 = _.keys(o2)
    var ki = _.intersection(k1, k2);
    return k1.length === k2.length && k2.length === ki.length;
}


function getSimpleEncodings(encodings, loaders, target) {
    // These encodings are handled in their own special way.
    var blacklist = ['source', 'destination', 'nodeId'];

    var sane = _.pick(encodings, function (enc, graphProperty) {
        if (_.contains(blacklist, graphProperty)) {
            return false;
        }

        if (!(graphProperty in loaders)) {
            console.warn('In encodings, unknown graph property:', graphProperty);
            return false;
        }

        if (!_.all(loaders[graphProperty], function (loader) { return loader.target == target; })) {
            console.warn('Wrong target type (node/edge) for graph property', graphProperty);
            return false;
        }
        if (enc.attributes.length !== 1) {
            console.warn('Support for multiple attributes not implemented yet for', graphProperty);
            return false;
        }
        return true;
    });

    return _.object(_.map(sane, function (enc, graphProperty) {
        return [graphProperty, enc.attributes[0]];
    }));
}


function checkMetadata(metadata, vg, vgAttributes) {
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
        throw new Error('Discrepenties between metadata and VGraph attributes');
    }
    if (nodesMetadata.count !== vg.nvertices || edgesMetadata.count !== vg.nedges) {
        throw new Error('Discrepenties in number of nodes/edges between metadata and VGraph');
    }

    return {
        'nodes': nodesMetadata,
        'edges': edgesMetadata
    };
}


function decode1(graph, vg, metadata)  {
    logger.debug('Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)',
                 vg.version, vg.name, vg.nvertices, vg.nedges);

    var vgAttributes = getAttributes1(vg);
    var graphInfo = checkMetadata(metadata, vg, vgAttributes);
    notifyClientOfSizesForAllocation(graph.socket, vg.nedges, vg.nvertices);

    var edges = new Array(vg.nedges);
    for (var i = 0; i < vg.edges.length; i++) {
        var e = vg.edges[i];
        edges[i] = [e.src, e.dst];
    }
    // TODO Check if x/y are bound in graphInfo.nodes.encodings
    var dimensions = [1, 1];

    var vertices = lookupInitialPosition(vg, _.values(vgAttributes.nodes));
    if (vertices === undefined) {
        clientNotification.loadingStatus(graph.socket, 'Initializing positions');
        vertices = computeInitialPositions(vg.nvertices, edges, dimensions, graph.socket);
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
    loadDataframe(graph, flatAttributeArray, vg.nvertices, vg.nedges, allEncodings, graphInfo);

    _.each(loaders, function (loaderArray, graphProperty) {
        _.each(loaderArray, function (loader) {
            var encodings = loader.target == VERTEX ? nodeEncodings : edgeEncodings;
            var attributes = loader.target == VERTEX ? vgAttributes.nodes : vgAttributes.edges;
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

function notifyClientOfSizesForAllocation (socket, nedges, nvertices) {
    var MAX_SIZE_TO_ALLOCATE = 2000000;
    var numElements = {
        edge: Math.min(nedges, MAX_SIZE_TO_ALLOCATE),
        point: Math.min(nvertices, MAX_SIZE_TO_ALLOCATE)
    };
    socket.emit('sizes_for_memory_allocation', numElements);
}


module.exports = {
    load: load
};

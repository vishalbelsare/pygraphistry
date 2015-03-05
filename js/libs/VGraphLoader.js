"use strict";

var Q = require('q');
var _ = require('underscore');
var fs = require('fs');
var debug = require('debug')('graphistry:graph-viz:data:vgraphloader');
var pb = require('protobufjs');
var zlib = require('zlib');
var path = require('path');

var config  = require('config')();
var util = require('../util.js');
var weakcc = require('../weaklycc.js');

var builder = pb.loadProtoFile(path.resolve(__dirname, 'graph_vector.proto'));
if (builder === null) {
    util.die('Could not find protobuf definition');
}
var pb_root = builder.build();

// TODO: Figure out how to read enum from protobuf
var VERTEX = 0;
var EDGE = 1;

var decoders = {
    0: decode0
}

//introduce mapping names, and for each, how to send mapped buffer to NBody.js
var attributeLoaders = function(graph) {
    return {
        pointTag: {
            load: graph.setPointTags,
            type: "number",
            default: graph.setPointTags,
            target: VERTEX,
            values: undefined
        },
        edgeTag: {
            load: graph.setEdgeTags,
            type: "number",
            default: graph.setEdgeTags,
            target: EDGE,
            values: undefined
        },
        pointSize: {
            load: graph.setSizes,
            type : "number",
            default: graph.setSizes,
            target: VERTEX,
            values: undefined
        },
        pointColor: {
            load: graph.setColors,
            type: "number",
            default: graph.setColors,
            target: VERTEX,
            values: undefined
        },
        edgeColor: {
            load: graph.setEdgeColors,
            type: "number",
            default: graph.setEdgeColors,
            target: EDGE,
            values: undefined
        },
        pointLabel: {
            load: graph.setLabels,
            type: "string",
            target: VERTEX,
            values: undefined
        }
    };
}

/**
 * Load the raw data from the dataset object from S3
**/
function load(graph, dataset) {
    var vg = pb_root.VectorGraph.decode(dataset.body)
    return decoders[vg.version](graph, vg, dataset.metadata);
}

function getAttributeMap(vg) {
    var vectors = vg.string_vectors.concat(vg.int32_vectors, vg.double_vectors);
    var map = {};
    for (var i = 0; i < vectors.length; i++) {
        var v = vectors[i];
        if (v.values.length > 0)
            map[v.name] = {
                target : v.target,
                type: typeof(v.values[0]),
                values: v.values
            };
    }
    return map;
}

function decode0(graph, vg, metadata)  {
    debug("Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)",
          vg.version, vg.name, vg.nvertices, vg.nedges);

    var amap = getAttributeMap(vg);
    debug("Graph has attribute: %o", Object.keys(amap))
    var vertices = [];
    var edges = []
    var dimensions = [1, 1];

    for (var i = 0; i < vg.edges.length; i++) {
        var e = vg.edges[i];
        edges.push([e.src, e.dst]);
    }


    // Do the vertices already exist in the serialized version?
    var xObj = _.find(vg.double_vectors, function (o) { return o.name === 'x'; });
    var yObj = _.find(vg.double_vectors, function (o) { return o.name === 'y'; });

    // Load vertices from protobuf Vertex message
    if (false && xObj && yObj) {
        debug('Loading previous vertices from xObj');
        for (var i = 0; i < vg.nvertices; i++) {
            vertices.push([xObj.values[i], yObj.values[i]]);
        }
    } else {
        debug('Running component analysis');

        var components = weakcc(vg.nvertices, edges, 2);
        var pointsPerRow = vg.nvertices / (Math.round(Math.sqrt(components.components.length)) + 1);

        var t0 = Date.now();
        var componentOffsets = [];
        var cumulativePoints = 0;
        var row = 0;
        var col = 0;
        var pointsInRow = 0;
        var maxPointsInRow = 0;
        var rowYOffset = 0;
        var rollingMax = 0;
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

        var initSize = 5 * Math.sqrt(vg.nvertices);
        for (var i = 0; i < vg.nvertices; i++) {
            var c = components.nodeToComponent[i];
            var offset = componentOffsets[c];
            var vertex = [ initSize * (offset.rowRollingSum + 0.9 * components.components[c].size * Math.random()) / vg.nvertices ];
            for (var j = 1; j < dimensions.length; j++) {
                vertex.push(initSize * (offset.rowYOffset + 0.9 * components.components[c].size * Math.random()) / vg.nvertices);
            }
            vertices.push(vertex);
        }
        debug('weakcc postprocess', Date.now() - t0);
    }

    var loaders = attributeLoaders(graph);
    var mapper = mappers[metadata.mapper];
    if (!mapper) {
        console.warn('WARNING Unknown mapper', metadata.mapper, 'using "default"');
        mapper = mappers['default'];
    }
    loaders = wrap(mapper.mappings, loaders);
    debug('Attribute loaders: %o', loaders);

    for (var vname in amap) {
        if (!(vname in loaders))
            continue;
        var loader = loaders[vname];

        var vec = amap[vname];
        if (vec.target != loader.target) {
            console.warn("WARNING Vertex/Node attribute mismatch for " + vname);
            continue;
        }

        if (vec.type != loader.type) {
            console.warn("WARNING Expected type " + loader.type + " but got " + vec.type);
            continue;
        }

        loaders[vname].values = vec.values;
    }

    var vloaders = _.filter(loaders, function (l) {return l.target == VERTEX;});
    var eloaders = _.filter(loaders, function (l) {return l.target == EDGE;});

    return graph.setVertices(vertices)
    .then(function () {
        return graph.setEdges(edges);
    }).then(function () {
        runLoaders(vloaders);
        runLoaders(eloaders);
    /*}).then(function(){ // BUGGY THUS DISABLED
        debug('writing into graph.simulator.buffers');
        // Copy all serialized data to simulator buffers if data is present
        // The serialized data lives in graph.vg
        var arrs = Object.keys(graph.simulator.buffers).map(function(index){

            // find the element with the index. TODO: make this a dict somehow?
            for (var el in graph.vg.float_vectors) {
                debug(el)
                if (graph.vg.float_vectors[el].name == index) {

                    var buffer = graph.simulator.buffers[index];
                    var raw = graph.vg.float_vectors[el].values;
                    var data = new Float32Array(raw);

                    try {
                        // Write the data to the buffer
                        return buffer.write(data).then(function(buf) {
                            debug('loaded ' + index)
                            return buf;
                        })
                    } catch (e) {
                        debug(e)
                    }
                    break;
                }
            }
        });
        return Q.all(arrs);*/
    }).then(function () {
        debug('all written');
        _.each(graph.simulator.layoutAlgorithms, function (la) {
            la.setPoints(graph.simulator);
        });
        return graph;
    }).then(function (graph) {
        _.each(graph.simulator.layoutAlgorithms, function (la) {
            la.setEdges(graph.simulator);
        });
        return graph;
    }).fail(util.makeErrorHandler('Failure in VGraphLoader'));
}

function runLoaders(loaders) {
    for (var i = 0; i < loaders.length; i++) {
        var loader = loaders[i];
        if (loader.values)
            loader.load(loader.values);
        else if (loader.default)
            loader.default()
    }
}

var testMapper = {
    mappings: {
        pointTag: {
            name: 'nodeTag'
        },
        edgeTag: {
            name: 'edgeTag'
        },
        pointSize: {
            name: "degree",
            transform: function (v) {
                return normalize(logTransform(v), 5, Math.pow(2, 8))
            }
        },
        pointLabel: {
            name: "label"
        },
        pointColor: {
            name: "community_spinglass",
            transform: function (v) {
                var palette = util.palettes.qual_palette2;
                return int2color(normalize(v, 0, palette.length - 1), palette);
            }
        },
        edgeColor: {
            name: "weight",
            transform: function (v) {
                var palette = util.palettes.green2red_palette;
                return int2color(normalize(logTransform(v), 0, palette.length - 1), palette);
            }
        }
    },
}

var testMapperDemo = {
    mappings: _.extend({}, testMapper.mappings, {
        x: {
            name: 'x'
        },
        y: {
            name: 'y'
        }
    }),
}

var debugMapper = {
    mappings: {
        pointLabel: {
            name: "label"
        },
        pointSize: {
            name: "size"
        }
    },
}

var splunkMapper = {
    mappings: {
        pointSize: {
            name: "pointSize",
            transform: function (v) {
                return normalize(v, 5, Math.pow(2, 8))
            }
        },
        pointLabel: {
            name: "pointLabel"
        },
        pointColor: {
            name: "pointColor",
            transform: function (v) {
                var palette = util.palettes.qual_palette2;
                return int2color(groupRoundAndClamp(v, 0, palette.length - 1), palette);
            }
        },
        edgeColor: {
            name: "edgeColor",
            transform: function (v) {
                var palette = util.palettes.green2red_palette;
                return int2color(normalize(v, 0, palette.length - 1), palette);
            }
        },
        pointTag: {
            name: "pointType",
            transform: function (v) {
                return normalize(v, 0, 2);
            }
        },
        edgeTag: {
            name: "edgeType",
            transform: function (v) {
                return normalize(v, 0, 2);
            }
        }
    }
}

function wrap(mappings, loaders) {
    var res = {}
    for (var a in loaders) {
        if (a in mappings) {
            var loader = loaders[a];
            var mapping = mappings[a];
            res[mapping.name] = loader;

            if ('transform' in mapping)
                // Helper function to work around dubious JS scoping
                doWrap(res, mapping, loader.load);

            debug("Mapping " + mapping.name + " to " + a);
        } else
            res[a] = loaders[a];
    }
    return res;
}

function doWrap(res, mapping, oldLoad) {
    res[mapping.name].load = function (data) {
        oldLoad(mapping.transform(data));
    }
}

var mappers = {
    'opentsdb': testMapper,
    'opentsdbDemo': testMapperDemo,
    'debug': debugMapper,
    'splunk': splunkMapper,
    'default': splunkMapper
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

// map values to integers between minimum and maximum
function groupRoundAndClamp(array, minimum, maximum) {
    return array.map(function (v) {
        var x = Math.round(v);
        return Math.max(minimum, Math.min(maximum, x));
    });
}

var int2color = util.int2color;

module.exports = {
    load: load,
};

"use strict";

var $ = require('jquery');
var Q = require('q');
var _ = require('underscore');
var fs = require('fs');
var debug = require('debug')('graphistry:graph-viz:data:vgraphloader');
var pb = require('protobufjs');
var zlib = require('zlib');
var path = require('path');
var config  = require('config')();
var util = require('../util.js');

var builder = null;
var pb_root = null;
pb.loadProtoFile(path.resolve(__dirname, 'graph_vector.proto'), function (err, builder_) {
    if (err) {
        console.error('could not build proto', err, err.stack);
        return;
    } else {
        builder = builder_;
        pb_root = builder.build();
    }
});

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
    graph.vg = pb_root.VectorGraph.decode(dataset.Body)
    return decoders[graph.vg.version](graph, graph.vg, dataset.Metadata.config);
}

function getAttributeMap(vg) {
    var vectors = vg.string_vectors.concat(vg.int32_vectors, vg.double_vectors);
    var map = {};
    for (var i = 0; i < vectors.length; i++) {
        var v = vectors[i];
        if (v.values.length > 0)
            map[v.name] = {"target" : v.target, "type": typeof(v.values[0]),
                           "values": v.values}
    }
    return map;
}

function decode0(graph, vg, config)  {
    debug("Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)",
          vg.version, vg.name, vg.nvertices, vg.nedges);

    var amap = getAttributeMap(vg);
    debug("Graph has attribute: %o", Object.keys(amap))
    var vertices = [];
    var edges = []
    var dimensions = [1, 1];

    // Do the vertices already exist in the serialized version?
    var xObj = _.find(vg.double_vectors, function (o) { return o.name === 'x'; });
    var yObj = _.find(vg.double_vectors, function (o) { return o.name === 'y'; });

    // Load vertices from protobuf Vertex message
    if (xObj && yObj) {
        debug('Loading previous vertices from xObj');
        for (var i = 0; i < vg.nvertices; i++) {
            vertices.push([xObj.values[i], yObj.values[i]]);
        }
    } else {
        // Generate them randomly
        debug('Generating random vertices')
        for (var i = 0; i < vg.nvertices; i++) {
            var vertex = [];
            for (var j = 0; j < dimensions.length; j++)
                vertex.push(Math.random() * dimensions[j]);
            vertices.push(vertex);
        }
    }

    for (var i = 0; i < vg.edges.length; i++) {
        var e = vg.edges[i];
        edges.push([e.src, e.dst]);
    }

    var loaders = attributeLoaders(graph);
    var mapper = undefined;
    if (config.mapper) {
        mapper = mappers[config.mapper]
        if (mapper)
            loaders = wrap(mapper.mappings, loaders)
        else
            console.warn("WARNING Unknown mapper ", config.mapper);
    }

    debug("Attribute loaders: %o", loaders)

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
        runLoaders(vloaders);
        return graph.setEdges(edges);
    }).then(function () {
        runLoaders(eloaders);
    }).then(function(){
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
        return Q.all(arrs);
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
    }).catch(function (error) {
        console.error("ERROR Failure in VGraphLoader ", error.stack)
    })
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
                var palette = qual_palette2;
                return int2color(normalize(v, 0, palette.length - 1), palette);
            }
        },
        edgeColor: {
            name: "weight",
            transform: function (v) {
                var palette = green2red_palette;
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
                var palette = qual_palette2;
                return int2color(normalize(v, 0, palette.length - 1), palette);
            }
        },
        edgeColor: {
            name: "edgeColor",
            transform: function (v) {
                var palette = green2red_palette;
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
    "opentsdbflowdump_1hrMapper": testMapper,
    "opentsdbflowdump_1hrMapperDemo": testMapperDemo,
    "debugMapper": debugMapper,
    "splunkMapper": splunkMapper
}

function logTransform(values) {
    return _.map(values, function (val) {
        return val <= 0 ? 0 : Math.log(val);
    });
}

function normalize(array, minimum, maximum) {
    var max = _.max(array);
    var min = _.min(array);
    var scaleFactor = (maximum - minimum) / (max - min + 1);

    return _.map(array, function (val) {
        return minimum + Math.floor((val - min) * scaleFactor);
    });
}

var rgb = util.rgb;
var palette1 = [
    rgb(234,87,61), rgb(251,192,99), rgb(100,176,188), rgb(68,102,153),
    rgb(85,85,119)
];
var blue_palette = [
    rgb(247,252,240), rgb(224,243,219), rgb(204,235,197), rgb(168,221,181),
    rgb(123,204,196), rgb(78,179,211), rgb(43,140,190), rgb(8,104,172),
    rgb(8,64,129)
];
var green2red_palette = [
    rgb(165,0,38), rgb(215,48,39), rgb(244,109,67), rgb(253,174,97),
    rgb(254,224,139), rgb(255,255,191), rgb(217,239,139), rgb(166,217,106),
    rgb(102,189,99), rgb(26,152,80), rgb(0,104,55)
].reverse();
var qual_palette1 = [
    rgb(141,211,199), rgb(255,255,179), rgb(190,186,218), rgb(251,128,114),
    rgb(128,177,211), rgb(253,180,98), rgb(179,222,105), rgb(252,205,229),
    rgb(217,217,217), rgb(188,128,189), rgb(204,235,197), rgb(255,237,111)
];
var qual_palette2 = [
    rgb(166,206,227), rgb(31,120,180), rgb(178,223,138), rgb(51,160,44),
    rgb(251,154,153), rgb(227,26,28), rgb(253,191,111), rgb(255,127,0),
    rgb(202,178,214), rgb(106,61,154), rgb(255,255,153), rgb(177,89,40)
];

function int2color(values, palette) {
    palette = palette || palette1;

    debug("Palette: %o", palette)

    var ncolors = palette.length;
    return _.map(values, function (val) {
        return palette[val % ncolors];
    });
}

module.exports = {
    load: load,
};

"use strict";

var $ = require('jquery');
var Q = require('q');
var _ = require('underscore');
var fs = require('fs');
var debug = require("debug")("graphistry:graph-viz:data:vgraphloader");
var pb = require("protobufjs");
var zlib = require("zlib");
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

var attributeLoaders = function(graph) {
    return {
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
    if (vg.vertices.length != 0) {
        vg.vertices.forEach(function(el) {
            vertices.push([el.x, el.y])
        });
    } else {
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
            loaders = mapper.wrap(loaders)
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
        // Copy all serialized data to simulator buffers if data is present
        // The serialized data lives in graph.vg
        var arrs = Object.keys(graph.simulator.buffers).map(function(index){
            var buffer = graph.simulator.buffers[index];
            var data;
    
            // find the element with the index. TODO: make this a dict somehow?
            for (var el in graph.vg.int32_buffer_vectors) {
                if (graph.vg.int32_buffer_vectors[el].name == index) {
                    var raw = graph.vg.int32_buffer_vectors[el].values;

                    data = new Float32Array(raw);

                    var normalArray = Array.prototype.slice.call(data);
                    
                    // sanity check
                    var total = normalArray.reduce(function(a, b) {
                      return a + b;
                    });
                    console.log(index, total, normalArray.length)

                    // Write the data to the buffer
                    try {
                        return buffer.write(data).then(function(buf) {
                            console.log('loaded ' + index)
                            return buf;
                        })                            
                    } catch (e) {
                        console.log(e)
                    }
                    break;
                }
            }
        })
        return Q.all(arrs);
    }).then(function () {
        _.each(graph.simulator.layoutAlgorithms, function (la) {
            la.setPoints(graph.simulator);
        });
        return graph;
    }).then(function (graph) {
        _.each(graph.simulator.layoutAlgorithms, function (la) {
            la.setEdges(graph.simulator);
        });
        return graph;
    }).then(function (graph) {
        // graph.simulator.setTimeSubset(graph.simulator.renderer, graph.simulator, graph.simulator.timeSubset.relRange);            
        return graph;
    })
    .then(function(graph){
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
        pointSize: {
            name: "degree",
            transform: function (v) {
                return normalizeUInt8(logTransform(v), 5)
            }
        },
        pointLabel: {
            name: "label"
        },
        pointColor: {
            name: "community_spinglass",
            transform: function (v) {
                return int2color(v);
            }
        },
        edgeColor: {
            name: "weight",
            tranform: function (v) {
                return int2color(v);
            }
        }
    },

    wrap: function(loaders) {
        var res = {}
        for (var a in loaders) {
            if (a in testMapper.mappings) {
                var loader = loaders[a];
                var mapping = testMapper.mappings[a];
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
}

function doWrap(res, mapping, oldLoad) {
    res[mapping.name].load = function (data) {
        oldLoad(mapping.transform(data));
    }
}

var mappers = {
    "opentsdbflowdump_1hrMapper": testMapper
}

function logTransform(values) {
    return _.map(values, function (val) {
        return val <= 0 ? 0 : Math.log(val);
    });
}

function normalizeUInt8(array, minimum) {
    var max = _.max(array);
    var min = _.min(array);
    var scaleFactor = (Math.pow(2, 8) - minimum) / (max - min + 1)

    return _.map(array, function (val) {
        return minimum + Math.floor((val - min) * scaleFactor);
    });
}
    
function int2color(values) {
    var palette = [util.rgb(234,87,61), util.rgb(251,192,99), util.rgb(100,176,188),
                   util.rgb(68,102,153), util.rgb(85,85,119)];
    var ncolors = palette.length;
    return _.map(values, function (val) {
        return palette[val % ncolors];
    });
}

module.exports = {
    load: load,
};

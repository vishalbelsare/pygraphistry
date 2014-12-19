"use strict";

var $ = require('jquery');
var Q = require('q');
var _ = require('underscore');
var fs = require('fs');
var debug = require("debug")("graphistry:graph-viz:data-loader");
var pb = require("protobufjs");
var zlib = require("zlib");
var path = require('path');
var config  = require('config')();

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
            type: "[number, number]",
            default: graph.setEdgeColors,
            target: EDGE,
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
    // silently failing wtfff

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
        // graph.simulator.buffers = graph.vg.int32_buffer_vectors;
    }).then(function(){
        var arrs = Object.keys(graph.simulator.buffers).map(function(index){
            var buffer = graph.simulator.buffers[index];
            var data;
    
            // find the element with the index. TODO: make this a dict somehow?
            for (var el in graph.vg.int32_buffer_vectors) {
                if (graph.vg.int32_buffer_vectors[el].name == index) {
                    var raw = graph.vg.int32_buffer_vectors[el].values;
                    data = new ArrayBuffer(raw);
                }
            }

            if (data) {
                return buffer.write(data).then(function(buf) {
                    console.log('loaded ' + index)
                })                    
            }

        })
        return Q.all(arrs);
    }).then(function(){
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
        }
    },

    wrap: function(loaders) {
        var res = {}
        for (var a in loaders) {
            if (a in testMapper.mappings) {
                var loader = loaders[a];
                var mapping = testMapper.mappings[a];
                if (mapping.transform) {
                    var oldLoad = loader.load;
                    loader.load = function (data) {oldLoad(mapping.transform(data))}
                }
                res[mapping.name] = loader;
                debug("Mapping " + mapping.name + " as " + a); 
            } else
                res[a] = loaders[a];
        }
        return res;
    }
}

var mappers = {
    "opentsdbflowdump_1hrMapper": testMapper
}

function logTransform(array) {
    var res = [];
    for (var i = 0; i < array.length; i++)
        res[i] = (array[i] <= 0 ? 0 : Math.log(array[i]))
    return res;
}

function normalizeUInt8(array, minimum) {
    var max = _.max(array);
    var min = _.min(array);

    var scaleFactor = (Math.pow(2, 8) - minimum) / (max - min + 1)

    var res = [];
    for (var i = 0; i < array.length; i++)
        res[i] = minimum + Math.floor((array[i] - min) * scaleFactor);
    return res;
}

module.exports = {
    load: load,
};

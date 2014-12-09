"use strict";

var $ = require('jquery');
var Q = require('q');
var _ = require('underscore');
var fs = require('fs');
var debug = require("debug")("graphistry:graph-viz:data-loader");
var pb = require("protobufjs");
var zlib = require("zlib");
var path = require('path');

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
        pointSizes: {
            load: function (sizes) {
                graph.setSizes(normalizeUInt8(logTransform(sizes), 5))
            },
            type : "number",
            default: graph.setSizes,
            target: VERTEX 
        },
        pointColor: {
            load: graph.setColors,
            type: "number",
            default: graph.setColors,
            target: VERTEX
        },
        edgeColor: {
            load: graph.setEdgeColors,
            type: "[number, number]",
            default: graph.setEdgeColors,
            target: EDGE
        }
    };
}

function load(graph, dataset) {
    return unpack(dataset.file).then(function (content) {
        var vg = pb_root.VectorGraph.decode(content)
        return decoders[vg.version](graph, vg, dataset.mappings);
    });
}

function unpack(filename) {
    var fileExt = filename.split('.').pop();
    var content = Q.denodeify(fs.readFile)(filename);
    if (fileExt == "gz") {
        debug("Unzipping dataset...");
        return content.then(function (data) {
            return Q.denodeify(zlib.gunzip)(data);
        })
    } else
        return content;
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

function decode0(graph, vg, mappings)  {
    debug("Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)",
          vg.version, vg.name, vg.nvertices, vg.nedges);

    var amap = getAttributeMap(vg);
    debug("Graph has attribute: %o", Object.keys(amap))
    var vertices = [];
    var edges = []
    var dimensions = [1, 1];
    var loaders = attributeLoaders(graph);

    for (var i = 0; i < vg.nvertices; i++) {
        var vertex = [];
        for (var j = 0; j < dimensions.length; j++)
            vertex.push(Math.random() * dimensions[j]);
        vertices.push(vertex);
    }

    for (var i = 0; i < vg.edges.length; i++) {
        var e = vg.edges[i];
        edges.push([e.src, e.dst]);
    }

    if (mappings) {
        for (var key in mappings) {
            if (!(key in loaders)) {
                console.warn("WARNING No loader for attribute " + key);
                continue;
            }
            var loader = loaders[key];

            var vname = mappings[key];
            if (!(vname in amap)) {
                console.warn("WARNING Dataset has no attribute vector named " + vname);
                continue;
            }

            var vec = amap[vname];
            if (vec.target != loader.target) {
                console.warn("WARNING Vertex/Node attribute mismatch for " + vname);
                continue;
            }

            if (vec.type != loader.type) {
                console.warn("WARNING Expected type " + loader.type + " but got " + vec.type);
                continue;
            }

            debug("Loading " + vname + " as " + key); 
            loaders[key].values = vec.values;
        }
    }

    var vloaders = _.filter(loaders, function (l) {return l.target == VERTEX;});
    var eloaders = _.filter(loaders, function (l) {return l.target == EDGE;});

    return graph.setVertices(vertices)
    .then(function () {
        runLoaders(vloaders);
        return graph.setEdges2(edges);
    }).then(function () {
        runLoaders(eloaders);
        return graph; 
    })
    .catch(function (error) {
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
    debug("DEGREES %o", res)
    return res;
}

module.exports = {
    load: load,
};

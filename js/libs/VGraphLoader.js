"use strict";

var $ = require('jquery');
var Q = require('q');
var fs = require('fs');
var debug = require("debug")("graphistry:graph-viz:data-loader");
var pb = require("protobufjs");
var zlib = require("zlib");

var builder = pb.loadProtoFile("js/libs/graph_vector.proto");
var pb_root = builder.build();

var decoders = {
    0: decode0
}

function load(graph, dataset) {
    return unpack(dataset.file).then(function (content) {
        var vg = pb_root.VectorGraph.decode(content)
        return decoders[vg.version](graph, vg);
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

function listAttributeValues(vg) {
    var vectors = vg.string_vectors.concat(vg.int32_vectors, vg.double_vectors);
    var res = [];
    for (var i = 0; i < vectors.length; i++) {
        var v = vectors[i];
        res.push([v.name, v.type, typeof(v.values[0])]);
    }
    return res;
}

function getAttributeValues(vg, name) {
    var vectors = vg.string_vectors.concat(vg.int32_vectors, vg.double_vectors);
    for (var i = 0; i < vectors.length; i++) {
        var v = vectors[i];
        if (v.name == name)
            return v.values;
    }
}

function decode0(graph, vg)  {
    debug("Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)", 
          vg.version, vg.name, vg.nvertices, vg.nedges);
    
    debug("Graph has attributes: %o", listAttributeValues(vg));

    var vertices = [];
    var edges = []
    var dimensions = [1, 1];

    var VERTEX = 0;
    var EDGE = 1;

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

    for (var i = 0; i < vg.string_vectors.length; i++) {
        var v = vg.string_vectors[i];
        if (v.type == VERTEX)
            graph.setPointAttributes(v.name, "string", v.values);
    }

    for (var i = 0; i < vg.double_vectors.length; i++) {
        var v = vg.double_vectors[i];
        if (v.type == VERTEX)
            graph.setPointAttributes(v.name, "float", v.values);
    }

    for (var i = 0; i < vg.int32_vectors.length; i++) {
        var v = vg.int32_vectors[i];
        if (v.type == VERTEX)
            graph.setPointAttributes(v.name, "int", v.values);
    }

    return graph.setPoints(vertices).then(function () {
        return graph.setEdges(edges);
    });

}

module.exports = {
    load: load,
};
// vim: set et ff=unix ts=8 sw=4 fdm=syntax: 

"use strict";

var $ = require('jquery');
var Q = require('q');
var fs = require('fs');
var debug = require("debug")("graphistry:graph-viz:data-loader");
var pb = require("protobufjs");

var builder = pb.loadProtoFile("js/libs/graph_vector.proto");
var pb_root = builder.build();

var decoders = {
    0: decode0
}

function load(graph, dataset) {
    return Q.denodeify(fs.readFile)(dataset.file)
        .then(function (content) {
            var vg = pb_root.VectorGraph.decode(content)
            return decoders[vg.version](graph, vg);
        });
}

function decode0(graph, vg)  {
    debug("Decoding VectorGraph (version: %d, name: %s, nodes: %d, edges: %d)", 
          vg.version, vg.name, vg.nvertices, vg.nedges);
    
    var vertices = [];
    var edges = []
    var dimensions = [1, 1, 1];

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

    return graph.setPoints(vertices).then(function () {
        return graph.setEdges(edges);
    });

}

module.exports = {
    load: load,
};
// vim: set et ff=unix ts=8 sw=4 fdm=syntax: 

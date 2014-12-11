"use strict";

var $ = require('jquery');
var Q = require('q');
var _ = require('underscore');
var fs = require('fs');
var debug = require("debug")("graphistry:graph-viz:data-loader");
var pb = require("protobufjs");
var zlib = require("zlib");
var path = require('path');
var fs = require('fs');

var builder = null;
var pb_root = null;

pb.loadProtoFile(path.resolve(__dirname, 'graph_vector.proto'), function (err, builder_) {
    if (err) {
        debug('error: could not build proto', err, err.stack);
        return;
    } else {
        builder = builder_;
        pb_root = builder.build();
    }
});

function write(graph) {
    buffers = graph.simulator.buffers;
    var vg = new pb_root.VectorGraph();
    var target  = new Int32Array(buffers['forwardsEdges'].size);
    vg.nvertices = buffers['curPoints'].size;
    vg.version = 0;
    vg.type = pb_root.VectorGraph.GraphType.UNDIRECTED;

    buffers['forwardsEdges'].read(target).then(function(buf) {
        for (var index = 0; index < target.length; index++) {
            if (index % 2 == 0) {
                try {
                    var edge = new pb_root.VectorGraph.Edge()
                    edge.src = target.buffer[index]
                    edge.dst = target.buffer[index + 1]
                    if (edge.src != 0 && edge.dst != 0){
                        vg.edges.push(edge)
                    }
                } catch (err) { 
                    debug(err)
                }
            }
        }
    })
    .then(function(){
        vg.nedges = vg.edges.length;
        try {
            var byteBuffer = vg.encode();
            var buffer = byteBuffer.toBuffer();
            // mongo query to update dataset

            datasetname = graph.datasetname;
            fs.writeFile(path.resolve(__dirname + "../../../node_modules/datasets/geo/uber.geo.serialized"), buffer, function(err) {
                if(err) {
                    debug(err);
                } else {
                    debug("saved serialized file");
                }
            });
        } catch (err) {
            debug(err)
        }        
    })

}

module.exports = {
    write: write,
};

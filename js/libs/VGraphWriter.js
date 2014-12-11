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
pb.loadProtoFile('/Users/abestanway/code/graphistry/graph-viz/js/libs/graph_vector.proto', function (err, builder_) {
    if (err) {
        console.error('could not build proto', err, err.stack);
        return;
    } else {
        builder = builder_;
        pb_root = builder.build();
    }
});

function write(buffers) {
    var vg = new pb_root.VectorGraph();
    for (var i in buffers) {
        if (i == 'forwardsEdges') {
            var target  = new Int32Array(buffers[i].size);
            vg.nvertices = buffers[i].size;
            buffers[i].read(target).then(function(buf) {
                for (var index = 0; index < target.length; index++) {
                    if (index % 2 == 0) {
                        try {
                            var edge = new pb_root.VectorGraph.Edge()
                            edge.src = target.buffer[index]
                            edge.dst = target.buffer[index + 1]
                            if (edge.src != 0 && edge.dst != 0){
                                vg.edges.push(edge)
                            }
                        } catch (err) { console.log(err)}
                    }
                }
                vg.version = 0;
                vg.type = pb_root.VectorGraph.GraphType.UNDIRECTED;
                vg.nedges = vg.edges.length;
                try {
                    var byteBuffer = vg.encode();
                    var buffer = byteBuffer.toBuffer();
                    fs.writeFile("/Users/abestanway/code/graphistry/datasets/geo/uber.geo.serialized", buffer, function(err) {
                        if(err) {
                            console.log(err);
                        } else {
                            console.log("saved serialized file");
                        }
                    });
                } catch (err) {
                    console.log(err)
                }
    
            })
        }
    }
}

module.exports = {
    write: write,
};

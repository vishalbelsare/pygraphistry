"use strict";

var $ = require('jquery');
var Q = require('q');
var _ = require('underscore');
var fs = require('fs');
var debug = require('debug')('graphistry:graph-viz:vgraphwriter');
var pb = require('protobufjs');
var zlib = require('zlib');
var path = require('path');
var fs = require('fs');
var config  = require('config')();
// var renderConfig = require('../../js/renderer.config.graph.js');

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
    debug('serializing and saving state...')
    
    // Grab the buffers from the simulator
    var buffers = graph.simulator.buffers;
    var vectors = [];

    // Add vertices. It's a flattened array, so compose into tuples.
    var untypedVertices = Array.prototype.slice.call(graph.__pointsHostBuffer);

    for (var index = 0; index < untypedVertices.length; index++) {
        if (index % 2 != 0) {
            continue;
        }

        var vertexMessage = new pb_root.VectorGraph.Vertex();
        vertexMessage.x = graph.__pointsHostBuffer[index];
        vertexMessage.y = graph.__pointsHostBuffer[index+1];
        graph.vg.vertices.push(vertexMessage);
    }

    if (graph.vg) {
        Q().then(function() {
            // Iterate through each buffer
            var arrs = Object.keys(buffers).map(function(index){

                var buffer = buffers[index];

                // TODO: Set this dynamically based on type?
                var target = new Float32Array(buffer.size);
                
                // Read the buffer data into a typed array and push to vectors array
                return buffer.read(target).then(function(buf) {
                    var vector = new pb_root.VectorGraph.Int32BufferVector();
                    var normalArray = Array.prototype.slice.call(target);
                    
                    vector.values = normalArray;
                    vector.name = index;
                    vectors.push(vector)

                    // sanity check
                    var total = normalArray.reduce(function(a, b) {
                      return a + b;
                    });
                    console.log(index, total, normalArray.length)
                    return target;
                })
            })
            return Q.all(arrs);
         }).then(function(arrs){
            try {
                // Set the data vectors on the VGraph
                graph.vg.int32_buffer_vectors = vectors;
                
                // Encode the protobuf
                var byteBuffer = graph.vg.encode();
                
                // Gzip and upload to S3
                zlib.gzip(byteBuffer.toBuffer(), function(err, zipped){
                    var savedName = graph.metadata.name.replace('.serialized','') + ".serialized"
                    console.log('saving as ' + savedName);
                    var params = {
                        Bucket: config.BUCKET,
                        Key: savedName,
                        ACL: 'private',
                        Metadata: {
                            type: graph.metadata.type,
                            config: JSON.stringify(graph.metadata.config)
                        },
                        Body: zipped,
                        ServerSideEncryption: 'AES256'
                    };
        
                    config.S3.putObject(params, function(err, data) {
                        if (err) {
                            debug(err)
                        } else {
                            debug("saved and uploaded " + savedName)
                        }
                    })            
                })
            } catch (e) {
                console.log(e)
            }
        })
        return;
    }
}

module.exports = {
    write: write,
};

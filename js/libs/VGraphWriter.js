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

//{<name>-> CLJSBuffer} -> Promise [ protobufvector ]
function readBuffers(buffers) {

    var vectors = [];

    // Iterate through each buffer
    var arrs = Object.keys(buffers).map(function(index){

        var buffer = buffers[index];

        // TODO: Set this dynamically based on type?
        var target = new Float32Array(buffer.size / Float32Array.BYTES_PER_ELEMENT);

        // Read the buffer data into a typed array and push to vectors array
        return buffer.read(target).then(function(buf) {
            var vector = new pb_root.VectorGraph.Float32BufferVector();
            var normalArray = Array.prototype.slice.call(target);

            vector.values = normalArray;
            vector.name = index;
            vectors.push(vector);

            return target;
        })
    })

    return Q.all(arrs).then(_.constant(vectors));

}

//Promise? graph * Promise? [ ProtobufVector ] -> Promise
var uploadBuffers = Q.promised(function (graph, vectors) {

    var done = Q.defer();

    try {
        // Set the data vectors on the VGraph
        graph.vg.float32_buffer_vectors = vectors;

        // Encode the protobuf
        var byteBuffer = graph.vg.encode();

        // Gzip and upload to S3
        zlib.gzip(byteBuffer.toBuffer(), function(err, zipped){
            if (err) { return done.reject(new Error(err)); }

            var savedName = graph.metadata.name.replace('.serialized','') + ".serialized"
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
                if (err) { return done.reject(new Error(err)); }

                debug('saved and uploaded ' + savedName);
                Q.resolve();
            });
        });

    } catch (e) {
        done.reject(new Error(e));
    }

    return done.promise;
});


// Graph -> Promise
function write(graph) {
    debug('serializing and saving state...')

    // Grab the buffers from the simulator
    var buffers = graph.simulator.buffers;

    // Add vertices. It's a flattened array, so compose into tuples.
    var untypedVertices = Array.prototype.slice.call(graph.__pointsHostBuffer);

    if (graph.vg.double_vectors === undefined) {
        graph.vg.double_vectors = new pb_root.VectorGraph.DoubleBufferVector();
    }

    for (var index = 0; index < untypedVertices.length; index++) {
        if (index % 2 != 0) {
            continue;
        }

        // Save the vertices to a double_vector in the protobuf
        var x = new pb_root.VectorGraph.DoubleAttributeVector();
        x.name = "x";
        x.values = graph.__pointsHostBuffer[index];
        x.target = pb_root.VectorGraph.AttributeTarget.VERTEX;
        graph.vg.double_vectors.push(x);

        var y = new pb_root.VectorGraph.DoubleAttributeVector();
        y.name = "y";
        y.values = graph.__pointsHostBuffer[index+1];
        y.target = pb_root.VectorGraph.AttributeTarget.VERTEX;
        graph.vg.double_vectors.push(y);
    }

    if (graph.vg) {
        return uploadBuffers(graph, readBuffers(buffers));
    } else {
        return Q();
    }
}

module.exports = {
    write: write,
};

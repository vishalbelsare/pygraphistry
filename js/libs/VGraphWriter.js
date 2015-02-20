"use strict";

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
            var vector = new pb_root.VectorGraph.FloatAttributeVector();
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
var uploadVGraph = Q.promised(function (vg, metadata) {

    debug('uploading VGraph', metadata.name);

    return Q()
        .then(function () { return vg.constructor === Buffer ? vg : (vg.encode().toBuffer()); })
        .then(Q.nfcall.bind('', zlib.gzip))
        .then(function (zipped) {

            var params = {
                Bucket: config.BUCKET,
                Key: metadata.name,
                ACL: 'private',
                Metadata: metadata,
                Body: zipped,
                ServerSideEncryption: 'AES256'
            };

            return Q.nfcall(config.S3.putObject.bind(config.S3), params);
        })
        .then(function () { debug('  uploaded', metadata.name); });
});


function uploadBuffers(graph, vectors) {
    graph.vg.float_vectors = vectors;
    var metadata = graph.metadata;
    metadata.name = metadata.name.replace('.serialized','') + '.serialized';
    return uploadVGraph(graph.vg, metadata);
}

// Graph -> Promise
function write(graph) {
    // Disable buggy serialization
    console.log('I AM DISABLED BECAUSE I AM BUGGY')
    if (true || !graph.vg) {
        return Q();
    }

    // FIXME: Very buggy
    debug('serializing and saving state...')

    // Grab the buffers from the simulator
    var buffers = graph.simulator.buffers;

    // Add vertices. It's a flattened array, so compose into tuples.
    var untypedVertices = Array.prototype.slice.call(graph.__pointsHostBuffer);

    if (graph.vg.double_vectors === undefined) {
        graph.vg.double_vectors = [];
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


    return uploadBuffers(graph, readBuffers(buffers));
}

module.exports = {
    write: write,
    uploadVGraph: uploadVGraph,
};

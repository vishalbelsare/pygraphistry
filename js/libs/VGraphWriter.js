'use strict';

var Q       = require('q');
var _       = require('underscore');
var pb      = require('protobufjs');
var path    = require('path');
var config  = require('config')();
var s3      = require('common/s3.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:data:vgraphwriter');

var builder = pb.loadProtoFile(path.resolve(__dirname, 'graph_vector.proto'));
if (builder === null) {
    logger.die('Could not find protobuf definition');
}
var pb_root = builder.build();

/* Hack way to serialize positions while waiting for dataframe */
function serializePositions(graph) {
    logger.trace('Serializing');
    var vg = graph.simulator.vgraph;

    var curPoints = graph.dataframe.getBuffer('curPoints', 'simulator');
    var numPoints = graph.dataframe.getNumElements('point');

    var xVal = new Array(numPoints);
    var yVal = new Array(numPoints);
    var values = new Float32Array(curPoints.size / Float32Array.BYTES_PER_ELEMENT);

    return curPoints.read(values).then(function () {
        for (var i = 0; i < numPoints; i++) {
            xVal[i] = values[2*i];
            yVal[i] = values[2*i + 1];
        }

        var xVec = new pb_root.VectorGraph.DoubleAttributeVector();
        xVec.name = 'x';
        xVec.values = xVal;
        xVec.target = pb_root.VectorGraph.AttributeTarget.VERTEX;
        vg.double_vectors.push(xVec);

        var yVec = new pb_root.VectorGraph.DoubleAttributeVector();
        yVec.name = 'y';
        yVec.values = yVal;
        yVec.target = pb_root.VectorGraph.AttributeTarget.VERTEX;
        vg.double_vectors.push(yVec);

        return vg;
    });
}

function save(graph, name) {
    logger.debug('Saving current graph as', name);

    return serializePositions(graph).then(function (vg) {
        var blob = vg.encode().toBuffer();
        logger.debug('Uploading to S3', name);
        return s3.upload(config.S3, config.BUCKET, {name: name}, blob);
    }).fail(log.makeQErrorHandler(logger, 'save vgraph'));
}

module.exports = {
    save: save
};

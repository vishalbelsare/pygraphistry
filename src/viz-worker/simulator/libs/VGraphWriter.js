'use strict';

const Q       = require('q');
const pb      = require('protobufjs');
const path    = require('path');
const config  = require('config')();
const s3      = require('common/s3.js');
const sprintf = require('sprintf-js').sprintf;

const log         = require('common/logger.js');
const logger      = log.createLogger('graph-viz:data:vgraphwriter');

// const builder = pb.loadProtoFile(path.resolve(__dirname, 'graph_vector.proto'));
// const graphVectorProtoPath = require.resolve('graph-viz/src/libs/graph_vector.proto');
const graphVectorProtoPath = path.resolve(__dirname, '../../src/libs/graph_vector.proto');
const builder = pb.loadProtoFile(graphVectorProtoPath);
if (builder === null) {
    logger.die('Could not find protobuf definition');
}
const protobufRoot = builder.build();

/* Hack way to serialize positions while waiting for dataframe */
function serializePositions(graph) {
    logger.trace('Serializing');
    const vg = graph.simulator.vgraph;

    const curPoints = graph.dataframe.getBuffer('curPoints', 'simulator');
    const numPoints = graph.dataframe.getNumElements('point');

    const xVal = new Array(numPoints);
    const yVal = new Array(numPoints);
    const values = new Float32Array(curPoints.size / Float32Array.BYTES_PER_ELEMENT);

    return curPoints.read(values).then(() => {
        for (let i = 0; i < numPoints; i++) {
            xVal[i] = values[2*i];
            yVal[i] = values[2*i + 1];
        }

        const xVec = new protobufRoot.VectorGraph.DoubleAttributeVector();
        xVec.name = 'x';
        xVec.values = xVal;
        xVec.target = protobufRoot.VectorGraph.AttributeTarget.VERTEX;
        vg.double_vectors.push(xVec);

        const yVec = new protobufRoot.VectorGraph.DoubleAttributeVector();
        yVec.name = 'y';
        yVec.values = yVal;
        yVec.target = protobufRoot.VectorGraph.AttributeTarget.VERTEX;
        vg.double_vectors.push(yVec);

        return vg;
    });
}

function save(graph, name) {
    logger.debug('Saving current graph as', name);

    return serializePositions(graph).then((vg) => {
        const blob = vg.encode().toBuffer();
        logger.debug('Uploading to S3', name);
        return s3.upload(config.S3, config.BUCKET, {name: name}, blob, {ContentEncoding: 'gzip'});
    }).fail(log.makeQErrorHandler(logger, 'save vgraph'));
}

module.exports = {
    save: save
};

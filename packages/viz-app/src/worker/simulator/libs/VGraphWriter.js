'use strict';

const Q       = require('q');
const config  = require('@graphistry/config')();
const s3      = require('@graphistry/common').s3;
const sprintf = require('sprintf-js').sprintf;

const log         = require('@graphistry/common').logger;
const logger      = log.createLogger('graph-viz:data:vgraphwriter');

const ProtoBuf = require('protobufjs/dist/protobuf-light');
const protoBufDefinitions = ProtoBuf.loadJson(require('viz-app/vgraph/graph_vector.proto')).build();

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

        const xVec = new protoBufDefinitions.VectorGraph.DoubleAttributeVector();
        xVec.name = 'x';
        xVec.values = xVal;
        xVec.target = protoBufDefinitions.VectorGraph.AttributeTarget.VERTEX;
        vg.double_vectors.push(xVec);

        const yVec = new protoBufDefinitions.VectorGraph.DoubleAttributeVector();
        yVec.name = 'y';
        yVec.values = yVal;
        yVec.target = protoBufDefinitions.VectorGraph.AttributeTarget.VERTEX;
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

export {
    save
};

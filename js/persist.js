'use strict';

var fs          = require('fs');

var _           = require('underscore');

var s3          = require('common/s3.js');

var config      = require('config')();

var CHECK_AT_EACH_SAVE = true;

var baseDirPath = __dirname + '/../assets/viz/';

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:persist');


//============

//need accumulated state
var prevHeader = {elements: {}, bufferByteLengths: {}};

//============


function ensurePath(path) {
    fs.exists(path, function (does_exist) {
        if (!does_exist) {
            fs.mkdir(path);
        }
    });
}


function checkWrite (snapshotName, vboPath, raw, buff) {
    var readback = fs.readFileSync(vboPath);
    logger.trace('readback', readback.length);
    for (var j = 0; j < raw.byteLength; j++) {
        if (buff[j] !== raw[j]) {
            logger.error('bad write', j, buff[j], raw[j]);
            throw 'exn';
        }
    }
    for (var j = 0; j < raw.byteLength; j++) {
        if (buff[j] !== readback[j]) {
            logger.error('mismatch', j, buff[j], readback[j]);
            throw 'exn';
        }
    }
    var read = fs.readFileSync(baseDirPath + snapshotName + '.metadata.json', {encoding: 'utf8'});
    logger.trace('readback metadata', read);
}

// Distinguish already compressed VBO from setting gzip encoding
function uploadPublic (path, buffer, params) {
    var uploadParams = !_.isEmpty(params) ? _.clone(params) : {};
    uploadParams.acl = 'public-read';
    return s3.upload(config.S3, config.BUCKET, {name: path}, buffer, uploadParams);
}


function staticContentForDataframe (dataframe, type) {
    var rows = dataframe.getRows(undefined, type),
        rowContents = new Array(rows.length),
        //offsetsBuffer = new Buffer(rows.length * 4),
        offsetsView = new Uint32Array(rows.length),
        //offsets = new Array(rows.length),
        currentContentOffset = 0,
        lastContentOffset = currentContentOffset;
    _.each(rows, function (row, rowIndex) {
        var content = new Buffer(JSON.stringify(row), 'utf8')
        var contentLength = content.length;
        //offsets[rowIndex] = currentContentOffset;
        offsetsView[rowIndex] = currentContentOffset;
        rowContents[rowIndex] = content;
        lastContentOffset = currentContentOffset;
        currentContentOffset += contentLength;
        if (currentContentOffset <= lastContentOffset) {
            throw new Error('Non-monotonic offset detected.');
        }
    });

    // Make a TypedArray to Buffer function. Use that here.
    var idx = new Buffer(offsetsView.byteLength);
    var bView = new Uint8Array(offsetsView.buffer);
    for (var i = 0; i < idx.length; i++) {
        idx[i] = bView[i];
    }
    return {contents: Buffer.concat(rowContents), indexes: idx};
}


module.exports =
    {
        saveConfig: function (snapshotName, renderConfig) {

            logger.debug('saving config', renderConfig);
            ensurePath(baseDirPath);
            fs.writeFileSync(baseDirPath + snapshotName + '.renderconfig.json', JSON.stringify(renderConfig));

        },

        saveVBOs: function (snapshotName, vbos, step) {

            logger.trace('serializing vbo');
            prevHeader = {
                elements: _.extend(prevHeader.elements, vbos.elements),
                bufferByteLengths: _.extend(prevHeader.bufferByteLengths, vbos.bufferByteLengths)
            };
            ensurePath(baseDirPath);
            fs.writeFileSync(baseDirPath + snapshotName + '.metadata.json', JSON.stringify(prevHeader));
            var buffers = vbos.uncompressed;
            for (var i in buffers) {
                var vboPath = baseDirPath + snapshotName + '.' + i + '.vbo';
                var raw = buffers[i];
                var buff = new Buffer(raw.byteLength);
                var arr = new Uint8Array(raw);
                for (var j = 0; j < raw.byteLength; j++) {
                    buff[j] = raw[j];
                }

                fs.writeFileSync(vboPath, buff);

                logger.debug('writing', vboPath, raw.byteLength, buff.length);

                if (CHECK_AT_EACH_SAVE) {
                    checkWrite(snapshotName, vboPath, raw, buff);
                }
            }
            logger.debug('wrote/read', prevHeader, _.keys(buffers));
        },

        pathForContentKey: function (snapshotName) {
            return 'Static/' + snapshotName + '/';
        },

        publishStaticContents: function (snapshotName, compressedVBOs, metadata, dataframe, renderConfig) {
            logger.trace('publishing current content to S3');
            var snapshotPath = this.pathForContentKey(snapshotName);
            var edgeExport = staticContentForDataframe(dataframe, 'edge');
            var pointExport = staticContentForDataframe(dataframe, 'point');
            uploadPublic(snapshotPath + 'renderconfig.json', JSON.stringify(renderConfig),
                {ContentType: 'application/json'});
            uploadPublic(snapshotPath + 'metadata.json', JSON.stringify(metadata),
                {ContentType: 'application/json'});
            var vboAttributes = [
                'curPoints',
                'curMidPoints',
                'springsPos',
                'edgeColors',
                'forwardsEdgeStartEndIdxs',
                'backwardsEdgeStartEndIdxs',
                'pointSizes',
                'pointColors',
                'logicalEdges'
            ];
            // compressedVBOs attributes are already gzipped:
            _.each(vboAttributes, function(attributeName) {
                if (compressedVBOs.hasOwnProperty(attributeName) && !_.isUndefined(compressedVBOs[attributeName])) {
                    uploadPublic(snapshotPath + attributeName + '.vbo', compressedVBOs[attributeName],
                        {should_compress: false});
                }
            });
            // These are ArrayBuffers, so ask for compression:
            uploadPublic(snapshotPath + 'pointLabels.offsets', pointExport.indexes,
                {should_compress: false});
            uploadPublic(snapshotPath + 'pointLabels.buffer', pointExport.contents,
                {should_compress: false});
            uploadPublic(snapshotPath + 'edgeLabels.offsets', edgeExport.indexes,
                {should_compress: false});
            return uploadPublic(snapshotPath + 'edgeLabels.buffer', edgeExport.contents,
                {should_compress: false});
        },

        publishPNGToStaticContents: function (snapshotName, imageName, binaryData) {
            logger.trace('publishing a PNG preview for content already in S3');
            var snapshotPath = this.pathForContentKey(snapshotName);
            imageName = imageName || 'preview.png';
            return uploadPublic(snapshotPath + imageName, binaryData, {should_compress: true});
        }
    };

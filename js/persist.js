'use strict';

var fs          = require('fs');
var path        = require('path');
var S3URLEncoder = require('node-s3-url-encode');

var _           = require('underscore');

var s3          = require('common/s3.js');

var config      = require('config')();

var CHECK_AT_EACH_SAVE = true;

var baseDirPath = path.join(__dirname, '/../assets/viz/');

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
    var readBack = fs.readFileSync(vboPath);
    logger.trace('readBack', readBack.length);
    var j;
    for (j = 0; j < raw.byteLength; j++) {
        if (buff[j] !== raw[j]) {
            logger.error('bad write', j, buff[j], raw[j]);
            throw Error('Bad Write: data length mismatch');
        }
    }
    for (j = 0; j < raw.byteLength; j++) {
        if (buff[j] !== readBack[j]) {
            logger.error('mismatch', j, buff[j], readBack[j]);
            throw Error('Bad Write: data content mismatch');
        }
    }
    var read = fs.readFileSync(path.join(baseDirPath, snapshotName + '.metadata.json'), {encoding: 'utf8'});
    logger.trace('readBack metadata', read);
}

function uploadPublic (path, buffer, params) {
    var uploadParams = _.extend(params || {}, {acl: 'public-read'});
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
            fs.writeFileSync(path.join(baseDirPath, snapshotName + '.renderconfig.json'), JSON.stringify(renderConfig));

        },

        saveVBOs: function (snapshotName, VBOs, step) {

            logger.trace('serializing vbo');
            prevHeader = {
                elements: _.extend(prevHeader.elements, VBOs.elements),
                bufferByteLengths: _.extend(prevHeader.bufferByteLengths, VBOs.bufferByteLengths)
            };
            ensurePath(baseDirPath);
            fs.writeFileSync(path.join(baseDirPath, snapshotName + '.metadata.json'), JSON.stringify(prevHeader));
            var buffers = VBOs.uncompressed;
            var bufferKeys = _.keys(buffers);
            _.each(bufferKeys, function (bufferKey) {
                var vboPath = path.join(baseDirPath, snapshotName + '.' + bufferKey + '.vbo');
                var raw = buffers[bufferKey];
                var buff = new Buffer(raw.byteLength);
                for (var j = 0; j < raw.byteLength; j++) {
                    buff[j] = raw[j];
                }

                fs.writeFileSync(vboPath, buff);

                logger.debug('writing', vboPath, raw.byteLength, buff.length);

                if (CHECK_AT_EACH_SAVE) {
                    checkWrite(snapshotName, vboPath, raw, buff);
                }
            });
            logger.debug('wrote/read', prevHeader, bufferKeys);
        },

        encodeS3PathAsURL: S3URLEncoder,

        pathForWorkbookSpecifier: function (workbookName) {
            return path.join('Workbooks', workbookName, '/');
        },

        pathForContentKey: function (snapshotName) {
            return path.join('Static', snapshotName, '/');
        },

        publishStaticContents: function (snapshotName, compressedVBOs, metadata, dataframe, renderConfig) {
            logger.trace('publishing current content to S3');
            var snapshotPath = this.pathForContentKey(snapshotName),
                edgeExport = staticContentForDataframe(dataframe, 'edge'),
                pointExport = staticContentForDataframe(dataframe, 'point');
            uploadPublic(path.join(snapshotPath, 'renderconfig.json'), JSON.stringify(renderConfig),
                {ContentType: 'application/json', ContentEncoding: 'gzip'});
            uploadPublic(path.join(snapshotPath, 'metadata.json'), JSON.stringify(metadata),
                {ContentType: 'application/json', ContentEncoding: 'gzip'});
            var vboAttributes = [
                'curPoints',
                'curMidPoints',
                'springsPos',
                'edgeColors',
                'edgeHeights',
                'midEdgeColors',
                'forwardsEdgeStartEndIdxs',
                'backwardsEdgeStartEndIdxs',
                'pointSizes',
                'pointColors',
                'logicalEdges'
            ];
            // compressedVBOs attributes are already gzipped:
            _.each(vboAttributes, function(attributeName) {
                if (compressedVBOs.hasOwnProperty(attributeName) && !_.isUndefined(compressedVBOs[attributeName])) {
                    uploadPublic(path.join(snapshotPath, attributeName + '.vbo'), compressedVBOs[attributeName],
                        {should_compress: false, ContentEncoding: 'gzip'});
                }
            });
            // These are ArrayBuffers, so ask for compression:
            uploadPublic(path.join(snapshotPath, 'pointLabels.offsets'), pointExport.indexes,
                {should_compress: false});
            uploadPublic(path.join(snapshotPath, 'pointLabels.buffer'), pointExport.contents,
                {should_compress: false});
            uploadPublic(path.join(snapshotPath, 'edgeLabels.offsets'), edgeExport.indexes,
                {should_compress: false});
            return uploadPublic(path.join(snapshotPath, 'edgeLabels.buffer'), edgeExport.contents,
                {should_compress: false});
        }.bind(module.exports),

        publishPNGToStaticContents: function (snapshotName, imageName, binaryData) {
            logger.trace('publishing a PNG preview for content already in S3');
            var snapshotPath = this.pathForContentKey(snapshotName);
            imageName = imageName || 'preview.png';
            return uploadPublic(snapshotPath + imageName, binaryData, {should_compress: true, ContentEncoding: 'gzip'});
        }
    };

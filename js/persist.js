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

function staticContentForDataframe (dataframe, type) {
    var rows = dataframe.getRows(undefined, type),
        rowContents = new Array(rows.length),
        //offsetsBuffer = new Buffer(rows.length * 4),
        offsetsView = new Uint32Array(rows.length),
        //offsets = new Array(rows.length),
        currentContentOffset = 0,
        lastContentOffset = currentContentOffset;
    _.each(rows, function (row, rowIndex) {
        var content = new Buffer(JSON.stringify(row), 'utf8');
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

/**
 * This just encapsulates the URL/directory structure of persisted content.
 * @param {String?} [prefixPath='']
 * @param {{S3: {String}, BUCKET: {String}}} options
 * @constructor
 */
function ContentSchema(prefixPath, options) {
    this.options = options || _.pick(config, ['S3', 'BUCKET']);
    this.prefixPath = prefixPath || '';
}

ContentSchema.prototype.pathForWorkbookSpecifier = function (workbookName) {
    return path.join(this.prefixPath, 'Workbooks', workbookName, '/');
};

ContentSchema.prototype.subSchemaForWorkbook = function (workbookName) {
    return new ContentSchema(this.pathForWorkbookSpecifier(workbookName), this.options);
};

ContentSchema.prototype.pathForStaticContentKey = function (snapshotName) {
    return path.join(this.prefixPath, 'Static', snapshotName, '/');
};

ContentSchema.prototype.subSchemaForStaticContentKey = function (snapshotName) {
    return new ContentSchema(this.pathForStaticContentKey(snapshotName), this.options);
};

ContentSchema.prototype.pathFor = function (subPath) {
    return path.join(this.prefixPath, subPath || '');
};

ContentSchema.prototype.getURL = function (subPath) {
    return new S3URLEncoder(this.pathFor(subPath));
};

ContentSchema.prototype.uploadPublic = function (subPath, buffer, params) {
    var uploadParams = _.extend(params || {}, {acl: 'public-read'});
    return this.uploadToS3(subPath, buffer, uploadParams);
};

ContentSchema.prototype.uploadToS3 = function (subPath, buffer, uploadParams) {
    return s3.upload(this.options.S3, this.options.BUCKET, {name: this.pathFor(subPath)}, buffer, uploadParams);
};


ContentSchema.prototype.download = function (subPath) {
    return s3.download(this.options.S3, this.options.BUCKET, this.pathFor(subPath), {expectCompressed: true});
};


module.exports =
    {
        // Save-methods are all about the local file system:

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

        // The following all deal with S3 or cluster file systems:

        ContentSchema: ContentSchema,

        /**
         * Publishes the layout data required to render the visualization as currently seen in the viewport.
         * Publishes publicly since we are using HTTP[S] to view.
         * @param {String} snapshotName
         * @param {Object} compressedVBOs
         * @param {Object} metadata
         * @param {Dataframe} dataframe
         * @param {Object} renderConfig
         * @returns {Promise}
         */
        publishStaticContents: function (snapshotName, compressedVBOs, metadata, dataframe, renderConfig) {
            logger.trace('publishing current content to S3');
            var snapshotSchema = (new ContentSchema()).subSchemaForStaticContentKey(snapshotName),
                edgeExport = staticContentForDataframe(dataframe, 'edge'),
                pointExport = staticContentForDataframe(dataframe, 'point');
            snapshotSchema.uploadPublic('renderconfig.json', JSON.stringify(renderConfig),
                {ContentType: 'application/json', ContentEncoding: 'gzip'});
            snapshotSchema.uploadPublic('metadata.json', JSON.stringify(metadata),
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
                    snapshotSchema.uploadPublic(attributeName + '.vbo', compressedVBOs[attributeName],
                        {shouldCompress: false, ContentEncoding: 'gzip'});
                }
            });
            // These are ArrayBuffers, so ask for compression:
            snapshotSchema.uploadPublic('pointLabels.offsets', pointExport.indexes,
                {shouldCompress: false});
            snapshotSchema.uploadPublic('pointLabels.buffer', pointExport.contents,
                {shouldCompress: false});
            snapshotSchema.uploadPublic('edgeLabels.offsets', edgeExport.indexes,
                {shouldCompress: false});
            return snapshotSchema.uploadPublic('edgeLabels.buffer', edgeExport.contents,
                {shouldCompress: false});
        },

        /**
         * Publishes a PNG thumbnail of the current layout as seen by the viewport for embedding.
         * @param {String} snapshotName
         * @param {String} [imageName="preview.png"]
         * @param {Buffer} binaryData
         * @returns {Promise}
         */
        publishPNGToStaticContents: function (snapshotName, imageName, binaryData) {
            logger.trace('publishing a PNG preview for content already in S3');
            var snapshotSchema = (new ContentSchema()).subSchemaForStaticContentKey(snapshotName);
            imageName = imageName || 'preview.png';
            return snapshotSchema.uploadPublic(imageName, binaryData, {shouldCompress: true, ContentEncoding: 'gzip'});
        }
    };

'use strict';

const Cache = require('@graphistry/common').cache;
const fs = require('fs');
const path = require('path');
const Q = require('q');
const url = require('url');
const encodeS3URI = require('node-s3-url-encode');

const _ = require('underscore');

const s3 = require('@graphistry/common').s3;

const config = require('@graphistry/config')();

const CHECK_AT_EACH_SAVE = true;

const baseDirPath = path.join(__dirname, '/../assets/viz/');

const labeler = require('./labeler.js');

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz:persist');

//============

//need accumulated state
let prevHeader = { elements: {}, bufferByteLengths: {} };

//============

function ensurePath(directoryPath) {
    fs.exists(directoryPath, doesExist => {
        if (!doesExist) {
            fs.mkdir(directoryPath);
        }
    });
}

const tmpCache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE);

function checkWrite(snapshotName, vboPath, raw, buff) {
    const readBack = fs.readFileSync(vboPath);
    logger.trace('readBack', readBack.length);
    for (let j = 0; j < raw.byteLength; j++) {
        if (buff[j] !== raw[j]) {
            logger.error('bad write', j, buff[j], raw[j]);
            throw Error('Bad Write: data length mismatch');
        }
    }
    for (let j = 0; j < raw.byteLength; j++) {
        if (buff[j] !== readBack[j]) {
            logger.error('mismatch', j, buff[j], readBack[j]);
            throw Error('Bad Write: data content mismatch');
        }
    }
    const read = fs.readFileSync(path.join(baseDirPath, snapshotName + '.metadata.json'), {
        encoding: 'utf8'
    });
    logger.trace('readBack metadata', read);
}

function staticContentForDataframe(dataframe, type) {
    // Delegate label data to the labeler for structural compatibility.
    // TODO support custom labels; requires a graph object.
    const rowCount = dataframe.getNumElements(type),
        labels = labeler.getDefaultLabels(dataframe, undefined, type),
        rowContents = new Array(rowCount),
        offsetsView = new Uint32Array(rowCount);
    let currentContentOffset = 0,
        lastContentOffset = currentContentOffset;
    _.each(labels, (label, rowIndex) => {
        const content = new Buffer(JSON.stringify(label), 'utf8');
        const contentLength = content.length;
        offsetsView[rowIndex] = currentContentOffset;
        rowContents[rowIndex] = content;
        lastContentOffset = currentContentOffset;
        currentContentOffset += contentLength;
        if (currentContentOffset <= lastContentOffset) {
            throw new Error('Non-monotonic offset detected.');
        }
    });

    // Make a TypedArray to Buffer function. Use that here.
    const idx = new Buffer(offsetsView.byteLength);
    const bView = new Uint8Array(offsetsView.buffer);
    for (let i = 0; i < idx.length; i++) {
        idx[i] = bView[i];
    }
    return { contents: Buffer.concat(rowContents), indexes: idx };
}

/**
 * This just encapsulates the URL/directory structure of persisted content.
 * @param {String?} [prefixPath='']
 * @param {{S3: {String}, BUCKET: {String}}} options
 * @constructor
 */
function ContentSchema(prefixPath = '', options = _.pick(config, ['S3', 'BUCKET'])) {
    this.options = options;
    this.prefixPath = prefixPath;
}

ContentSchema.prototype = {
    pathForWorkbookSpecifier: function(workbookName) {
        return path.join(this.prefixPath, 'Workbooks', workbookName, '/');
    },

    subSchemaForWorkbook: function(workbookName) {
        return new ContentSchema(this.pathForWorkbookSpecifier(workbookName), this.options);
    },

    pathForStaticContentKey: function(snapshotName) {
        return path.join(this.prefixPath, 'Static', snapshotName, '/');
    },

    subSchemaForStaticContentKey: function(snapshotName) {
        return new ContentSchema(this.pathForStaticContentKey(snapshotName), this.options);
    },

    pathFor: function(subPath) {
        return path.join(this.prefixPath, subPath || '');
    },

    getURL: function(subPath) {
        return url.parse(encodeS3URI(this.pathFor(subPath)));
    },

    uploadPublic: function(subPath, buffer, params) {
        const uploadParams = _.extend(params || {}, { acl: 'public-read' });
        return this.uploadToS3(subPath, buffer, uploadParams);
    },

    uploadToS3: function(subPath, buffer, uploadParams) {
        return s3.upload(
            this.options.S3,
            this.options.BUCKET,
            { name: this.pathFor(subPath) },
            buffer,
            uploadParams
        );
    },

    download: function(subPath) {
        return s3.download(this.options.S3, this.options.BUCKET, this.pathFor(subPath), {
            expectCompressed: true
        });
    },

    get: function(subPath) {
        const result = Q.defer();
        const contentURL = this.getURL(subPath);
        tmpCache
            .get(contentURL)
            .then(cacheResponse => {
                result.resolve(cacheResponse);
            })
            .fail(() => {
                this.download(subPath)
                    .then(downloadResponse => {
                        tmpCache.put(contentURL, downloadResponse);
                        result.resolve(downloadResponse);
                    })
                    .fail(downloadResponse => {
                        result.reject(downloadResponse);
                    });
            });
        return result.promise;
    }
};

module.exports = {
    // Save-methods are all about the local file system:

    saveConfig: function(snapshotName, renderConfig) {
        logger.debug('saving config', renderConfig);
        ensurePath(baseDirPath);
        fs.writeFileSync(
            path.join(baseDirPath, snapshotName + '.renderconfig.json'),
            JSON.stringify(renderConfig)
        );
    },

    saveVBOs: function(snapshotName, VBOs /*, step*/) {
        logger.trace('serializing vbo');
        prevHeader = {
            elements: _.extend(prevHeader.elements, VBOs.elements),
            bufferByteLengths: _.extend(prevHeader.bufferByteLengths, VBOs.bufferByteLengths)
        };
        ensurePath(baseDirPath);
        fs.writeFileSync(
            path.join(baseDirPath, snapshotName + '.metadata.json'),
            JSON.stringify(prevHeader)
        );
        const buffers = VBOs.uncompressed;
        const bufferKeys = _.keys(buffers);
        _.each(bufferKeys, bufferKey => {
            const vboPath = path.join(baseDirPath, snapshotName + '.' + bufferKey + '.vbo');
            const raw = buffers[bufferKey];
            const buff = new Buffer(raw.byteLength);
            for (let j = 0; j < raw.byteLength; j++) {
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
    publishStaticContents: function(
        snapshotName,
        compressedVBOs,
        metadata,
        dataframe,
        renderConfig
    ) {
        logger.trace('publishing current content to S3');
        const snapshotSchema = new ContentSchema().subSchemaForStaticContentKey(snapshotName),
            edgeExport = staticContentForDataframe(dataframe, 'edge'),
            pointExport = staticContentForDataframe(dataframe, 'point');
        const vboAttributes = [
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
            'logicalEdges', // Obsolete, transitioned to edgeSeqLens and forwardsEdgeToUnsortedEdge (following).
            'edgeSeqLens',
            'forwardsEdgeToUnsortedEdge'
        ];
        // Stage the uploads so that partial failure maximizes available features:
        // TODO report partial failure sensibly (e.g. "everything exported but labels").
        return Q.all([
            snapshotSchema.uploadPublic('renderconfig.json', JSON.stringify(renderConfig), {
                ContentType: 'application/json',
                ContentEncoding: 'gzip'
            }),
            snapshotSchema.uploadPublic('metadata.json', JSON.stringify(metadata), {
                ContentType: 'application/json',
                ContentEncoding: 'gzip'
            })
        ])
            .catch(err => {
                throw new Error('Failed to upload JSON metadata: ', err.message);
            })
            .then(() => {
                // compressedVBOs attributes are already gzipped:
                return Q.all(
                    _.select(vboAttributes, attributeName => {
                        return (
                            compressedVBOs.hasOwnProperty(attributeName) &&
                            !_.isUndefined(compressedVBOs[attributeName])
                        );
                    }).map(attributeName => {
                        return snapshotSchema.uploadPublic(
                            attributeName + '.vbo',
                            compressedVBOs[attributeName],
                            { shouldCompress: false, ContentEncoding: 'gzip' }
                        );
                    })
                ).catch(err => {
                    throw new Error('Failed to upload VBOs: ', err.message);
                });
            })
            .then(() => {
                return Q.allSettled([
                    // These are ArrayBuffers, so ask for compression:
                    snapshotSchema.uploadPublic('pointLabels.offsets', pointExport.indexes, {
                        shouldCompress: false
                    }),
                    snapshotSchema.uploadPublic('pointLabels.buffer', pointExport.contents, {
                        shouldCompress: false
                    }),
                    snapshotSchema.uploadPublic('edgeLabels.offsets', edgeExport.indexes, {
                        shouldCompress: false
                    }),
                    snapshotSchema.uploadPublic('edgeLabels.buffer', edgeExport.contents, {
                        shouldCompress: false
                    })
                ]);
            })
            .catch(err => {
                throw new Error('Failed to upload label contents: ', err.message);
            });
    },

    /**
     * Publishes a PNG thumbnail of the current layout as seen by the viewport for embedding.
     * @param {String} snapshotName
     * @param {String} [imageName="preview.png"]
     * @param {Buffer} binaryData
     * @returns {Promise}
     */
    publishPNGToStaticContents: function(snapshotName, imageName, binaryData) {
        logger.trace('publishing a PNG preview for content already in S3');
        const snapshotSchema = new ContentSchema().subSchemaForStaticContentKey(snapshotName);
        imageName = imageName || 'preview.png';
        return snapshotSchema.uploadPublic(imageName, binaryData, {
            shouldCompress: true,
            ContentEncoding: 'gzip'
        });
    }
};

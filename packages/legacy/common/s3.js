'use strict';

var _        = require('underscore');
var Q        = require('q');
var zlib     = require('zlib');

var log         = require('./logger.js');
var logger      = log.createLogger('graphistry:common:s3');


// S3 * String * {name: String, ...} * Buffer -> Promise
function upload(S3, bucket, metadata, binaryBuffer, params) {
    logger.debug('Uploading binary blob', metadata.name);

    var acl = params && params.acl,
        compressed = true,
        putParams = {
            Bucket: bucket,
            Key: metadata.name,
            ACL: acl || 'private',
            Metadata: metadata,
            Body: binaryBuffer,
            ServerSideEncryption: 'AES256'
        };

    if (params && !_.isEmpty(params)) {
        if (params.compressed !== undefined) {
            compressed = params.compressed;
        }

        if (params.ContentType) {
            putParams.ContentType = params.ContentType;
        }
    }

    if (compressed) {
        putParams.ContentEncoding = 'gzip';
        return Q.nfcall(zlib.gzip, binaryBuffer)
            .then(function (zipped) {
                putParams.Body = zipped;
                logger.debug('Upload size', (putParams.Body.length / 1000).toFixed(1), 'KB');
                return Q.nfcall(S3.putObject.bind(S3), putParams);
            }).then(function () {
                logger.debug('Upload done', metadata.name);
            });
    } else {
        logger.debug('Upload size', (putParams.Body.length / 1000).toFixed(1), 'KB');
        return Q.nfcall(S3.putObject.bind(S3), putParams)
            .then(function () {
                logger.debug('Upload done', metadata.name);
            });
    }
}

module.exports = {
    upload: upload
};

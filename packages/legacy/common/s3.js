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
        should_compress = true,
        putParams = {
            Bucket: bucket,
            Key: metadata.name,
            ACL: acl || 'private',
            Metadata: metadata,
            Body: binaryBuffer,
            ServerSideEncryption: 'AES256',
            CacheControl: 'public, max-age=86400'
        };

    if (params && !_.isEmpty(params)) {
        if (params.should_compress !== undefined) {
            should_compress = params.should_compress;
        }

        if (params.ContentType) {
            putParams.ContentType = params.ContentType;
        }

        if (params.ContentEncoding) {
            putParams.ContentEncoding = params.ContentEncoding;
        }
    }

    if (should_compress) {
        return Q.nfcall(zlib.gzip, binaryBuffer)
            .then(function (zipped) {
                putParams.Body = zipped;
                logger.debug('Upload (gzipped) size', (putParams.Body.length / 1000).toFixed(1), 'KB');
                return Q.nfcall(S3.putObject.bind(S3), putParams);
            }).then(function () {
                logger.debug('Upload (gzipped) done', metadata.name);
            }).catch(function (e) {
                logger.debug('Upload Error', e);
                throw e;
            });
    } else {
        logger.debug('Upload size', (putParams.Body.length / 1000).toFixed(1), 'KB');
        return Q.nfcall(S3.putObject.bind(S3), putParams)
            .then(function () {
                logger.debug('Upload done', metadata.name);
            }).catch(function (e) {
                logger.debug('Upload Error', e);
                throw e;
            });
    }
}

module.exports = {
    upload: upload
};

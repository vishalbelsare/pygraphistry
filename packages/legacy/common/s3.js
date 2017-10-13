'use strict';

var _        = require('underscore');
var Q        = require('q');
var zlib     = require('zlib');

var config      = require('@graphistry/config')();
var log         = require('./logger.js');
var logger      = log.createLogger('graphistry:common:s3');


module.exports = {
    upload: function upload(S3, bucket, metadata, binaryBuffer, params) {
        if (!config.S3_ACCESS || !config.S3_SECRET) {
            logger.warn('Not uploading to S3 (disabled by config)');
            return Q();
        }

        logger.debug('Uploading binary blob', metadata.name);

        var acl = params && params.acl,
            shouldCompress = true,
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
            if (params.shouldCompress !== undefined) {
                shouldCompress = params.shouldCompress;
            }

            if (params.ContentType) {
                putParams.ContentType = params.ContentType;
            }

            if (params.ContentEncoding) {
                putParams.ContentEncoding = params.ContentEncoding;
            }
        }

        var kilo = 1024;
        var uploadOptions = {partSize: 6 * kilo * kilo, leavePartsOnError: true/*, queueSize: 1*/};

        var promiseResult;
        if (shouldCompress) {
            promiseResult = Q.nfcall(zlib.gzip, binaryBuffer)
                .then(function (zipped) {
                    putParams.Body = zipped;
                    logger.debug('Upload (gzipped) size', (putParams.Body.length / 1024).toFixed(1), 'KB');
                    return Q.nfcall(S3.upload.bind(S3), putParams, uploadOptions);
                }).then(function () {
                    logger.debug('Upload (gzipped) done', metadata.name);
                }).catch(function (e) {
                    logger.debug('Upload Error', e);
                    throw e;
                });
        } else {
            logger.debug('Upload size', (putParams.Body.length / kilo).toFixed(1), 'KB');
            promiseResult = Q.nfcall(S3.upload.bind(S3), putParams, uploadOptions)
                .then(function () {
                    logger.debug('Upload done', metadata.name);
                }).catch(function (e) {
                    logger.debug('Upload Error', e);
                    throw e;
                });
        }
        return promiseResult;
    },
    download: function (S3, bucket, name, params) {
        var getParams = {
            Bucket: bucket,
            Key: name
        };
        var expectCompressed = true;
        if (params && !_.isEmpty(params)) {
            if (params.expectCompressed !== undefined) {
                expectCompressed = params.expectCompressed;
            }
        }
        var deferred = Q.defer();
        S3.getObject(getParams, function (error, data) {
            if (error) {
                deferred.reject(error);
            } else {
                var binaryBuffer = data.Body;
                if (expectCompressed) {
                    Q.nfcall(zlib.gunzip, binaryBuffer)
                        .then(function (unzipped) {
                            deferred.resolve(unzipped);
                        }).catch(function (e) {
                            deferred.reject(e);
                        });
                } else {
                    deferred.resolve(binaryBuffer.toString());
                }
            }
        });
        return deferred.promise;
    }
};

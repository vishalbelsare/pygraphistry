'use strict';

var _        = require('underscore');
var Q        = require('q');
var zlib     = require('zlib');
var debug    = require('debug')('graphistry:common:s3');


// S3 * String * {name: String, ...} * Buffer -> Promise
function upload(S3, bucket, metadata, binaryBuffer, params) {
    debug('Uploading binary blob', metadata.name);

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

        if (params['ContentType']) {
            putParams['ContentType'] = params['ContentType'];
        }
    }

    if (compressed) {
        return Q.nfcall(zlib.gzip, binaryBuffer)
            .then(function (zipped) {
                putParams.Body = zipped;
                debug('Upload size', (putParams.Body.length / 1000).toFixed(1), 'KB');
                return Q.nfcall(S3.putObject.bind(S3), putParams);
            }).then(function () {
                debug('Upload done', metadata.name);
            });
    } else {
        debug('Upload size', (putParams.Body.length / 1000).toFixed(1), 'KB');
        return Q.nfcall(S3.putObject.bind(S3), putParams)
            .then(function () {
                debug('Upload done', metadata.name);
            });
    }
}

module.exports = {
    upload: upload
};

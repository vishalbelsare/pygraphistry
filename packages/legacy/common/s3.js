'use strict';

var _        = require('underscore');
var Q        = require('q');
var zlib     = require('zlib');
var debug    = require('debug')('graphistry:common:s3');


// S3 * String * {name: String, ...} * Buffer -> Promise
function upload(S3, bucket, metadata, binaryBuffer, params) {
    debug('Uploading binary blob', metadata.name);

    var acl = params && params.acl;

    return Q.nfcall(zlib.gzip, binaryBuffer)
        .then(function (zipped) {
            var putParams = {
                Bucket: bucket,
                Key: metadata.name,
                ACL: acl || 'private',
                Metadata: metadata,
                Body: zipped,
                ServerSideEncryption: 'AES256'
            };

            debug('Upload size', (zipped.length/1000).toFixed(1), 'KB');
            return Q.nfcall(S3.putObject.bind(S3), putParams);
        }).then(function () {
            debug('Upload done', metadata.name);
        });
}

module.exports = {
    upload: upload
};

'use strict';

var _        = require('underscore');
var Q        = require('q');
var zlib     = require('zlib');
var debug    = require('debug')('graphistry:common:s3');


// S3 * String * {name: String, ...} * Buffer -> Promise
function upload(S3, bucket, metadata, binaryBuffer) {
    debug('Uploading binary blob', metadata.name);

    return Q.nfcall(zlib.gzip, binaryBuffer)
        .then(function (zipped) {
            var params = {
                Bucket: bucket,
                Key: metadata.name,
                ACL: 'private',
                Metadata: metadata,
                Body: zipped,
                ServerSideEncryption: 'AES256'
            };

            debug('Upload size', (zipped.length/1000).toFixed(1), 'KB');
            return Q.nfcall(S3.putObject.bind(S3), params);
        }).then(function () {
            debug('Upload done', metadata.name);
        });
}

module.exports = {
    upload: upload
};

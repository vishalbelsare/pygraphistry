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
    logger.debug('readback', readback.length);
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
    logger.debug('readback metadata', read);
}


function uploadPublic (path, buffer, params) {
    var uploadParams = !_.isEmpty(params) ? _.clone(params) : {};
    uploadParams.acl = 'public-read';
    s3.upload(config.S3, config.BUCKET, {name: path}, buffer, uploadParams);
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

        publishStaticContents: function (snapshotName, compressedVBOs, metadata, renderConfig) {
            logger.trace('publishing current content to S3');
            var snapshotPath = 'Static/' + snapshotName + '/';
            uploadPublic(snapshotPath + 'renderconfig.json', JSON.stringify(renderConfig), {ContentType: 'application/json'});
            uploadPublic(snapshotPath + 'metadata.json', JSON.stringify(metadata), {ContentType: 'application/json'});
            uploadPublic(snapshotPath + 'curPoints.vbo', compressedVBOs.curPoints, {compressed: false});
            uploadPublic(snapshotPath + 'springsPos.vbo', compressedVBOs.springsPos, {compressed: false});
            uploadPublic(snapshotPath + 'edgeColors.vbo', compressedVBOs.edgeColors, {compressed: false});
            uploadPublic(snapshotPath + 'pointSizes.vbo', compressedVBOs.pointSizes, {compressed: false});
            uploadPublic(snapshotPath + 'pointColors.vbo', compressedVBOs.pointColors, {compressed: false});
            uploadPublic(snapshotPath + 'logicalEdges.vbo', compressedVBOs.logicalEdges, {compressed: false});
        }
    };

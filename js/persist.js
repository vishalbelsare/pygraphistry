var fs          = require('fs');

var debug       = require('debug')('graphistry:graph-viz:persist');
var _           = require('underscore');

var s3          = require('common/s3.js');

var config      = require('config')();

var CHECK_AT_EACH_SAVE = true;

var baseDirPath = __dirname + '/../assets/viz/';


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
    debug('readback', readback.length);
    for (var j = 0; j < raw.byteLength; j++) {
        if (buff[j] !== raw[j]) {
            console.error('bad write', j, buff[j], raw[j]);
            throw 'exn';
        }
    }
    for (var j = 0; j < raw.byteLength; j++) {
        if (buff[j] !== readback[j]) {
            console.error('mismatch', j, buff[j], readback[j]);
            throw 'exn';
        }
    }
    var read = fs.readFileSync(baseDirPath + snapshotName + '.metadata.json', {encoding: 'utf8'});
    debug('readback metadata', read);
}


function uploadPublic (path, buffer) {
    s3.upload(config.S3, config.BUCKET, {name: path}, buffer, {acl: 'public-read'});
}


module.exports =
    {
        saveConfig: function (snapshotName, renderConfig) {

            debug('saving config', renderConfig);
            ensurePath(baseDirPath);
            fs.writeFileSync(baseDirPath + snapshotName + '.renderconfig.json', JSON.stringify(renderConfig));

        },

        saveVBOs: function (snapshotName, vbos, step) {

            debug('serializing vbo');
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

                debug('writing', vboPath, raw.byteLength, buff.length);

                if (CHECK_AT_EACH_SAVE) {
                    checkWrite(snapshotName, vboPath, raw, buff);
                }
            }
            debug('wrote/read', prevHeader, _.keys(buffers));
        },

        saveCurrentVBO: function (snapshotName, vbos) {
            debug('publishing current content to S3');
            var snapshotPath = 'Static/' + snapshotName + '/';
            uploadPublic(snapshotPath + 'metadata.json', JSON.stringify(prevHeader));
            uploadPublic(snapshotPath + 'curPoints', vbos.curPoints);
            uploadPublic(snapshotPath + 'springPos', vbos.springsPos);
        }
    };

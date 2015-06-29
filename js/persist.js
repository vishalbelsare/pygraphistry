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


function uploadPublic (path, buffer, params) {
    var uploadParams = !_.isEmpty(params) ? _.clone(params) : {};
    uploadParams.acl = 'public-read';
    s3.upload(config.S3, config.BUCKET, {name: path}, buffer, uploadParams);
}


function staticContentForDataframe (dataframe, type) {
    var rows = dataframe.getRows(undefined, type);
    var rowContents = new Array(rows.length);
    var indexes = new ArrayBuffer(rows.length);
    var indexesView = new Uint32Array(indexes);
    var currentContentIndex = 0;
    _.each(rows, function (row, rowIndex) {
        var content = JSON.stringify(row),
            contentLength = content.length;
        indexesView[rowIndex] = currentContentIndex;
        rowContents[rowIndex] = content;
        currentContentIndex += contentLength;
    });
    return {contents: Buffer.concat(rowContents), indexes: indexes};
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

        publishStaticContents: function (snapshotName, compressedVBOs, metadata, dataframe, renderConfig) {
            debug('publishing current content to S3');
            var snapshotPath = 'Static/' + snapshotName + '/';
            uploadPublic(snapshotPath + 'renderconfig.json', JSON.stringify(renderConfig), {ContentType: 'application/json'});
            uploadPublic(snapshotPath + 'metadata.json', JSON.stringify(metadata), {ContentType: 'application/json'});
            uploadPublic(snapshotPath + 'curPoints.vbo', compressedVBOs.curPoints);
            uploadPublic(snapshotPath + 'springsPos.vbo', compressedVBOs.springsPos);
            uploadPublic(snapshotPath + 'edgeColors.vbo', compressedVBOs.edgeColors);
            uploadPublic(snapshotPath + 'pointSizes.vbo', compressedVBOs.pointSizes);
            uploadPublic(snapshotPath + 'pointColors.vbo', compressedVBOs.pointColors);
            uploadPublic(snapshotPath + 'logicalEdges.vbo', compressedVBOs.logicalEdges);
            var edgeExport = staticContentForDataframe(dataframe, 'edge');
            uploadPublic(snapshotPath + 'edgeLabels.buffer', edgeExport.contents);
            uploadPublic(snapshotPath + 'edgeIndexes.buffer', edgeExport.indexes);
            var pointExport = staticContentForDataframe(dataframe, 'point');
            uploadPublic(snapshotPath + 'pointLabels.buffer', pointExport.contents);
            uploadPublic(snapshotPath + 'pointIndexes.buffer', pointExport.indexes);
        }
    };

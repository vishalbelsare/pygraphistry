var fs          = require('fs');

var debug       = require('debug')('graphistry:graph-viz:persist');
var _           = require('underscore');


var NAME = 'facebook';
var SAVE_AT_EACH_STEP = true;
var CHECK_AT_EACH_SAVE = true;

var basePath = __dirname + '/../assets/viz/' + NAME + '.';


//============

//need accumulated state
var prevHeader = {elements: {}, bufferByteLengths: {}};

//============


function checkWrite (vboPath, raw, buff) {
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
    var read = fs.readFileSync(basePath + 'metadata.json', {encoding: 'utf8'});
    debug('readback metadata', read);
}


module.exports =
    !SAVE_AT_EACH_STEP ?
        {
            maybeSaveConfig: _.identity,
            maybeSaveVbos: _.identity
        }
    : {
        maybeSaveConfig: function (renderConfig) {

            if (Math.random() < 0.95) {
                return;
            }

            debug('saving config', renderConfig);
            fs.writeFileSync(basePath + 'renderconfig.json', JSON.stringify(renderConfig));

        },

        maybeSaveVbos: function (vbos, step) {

            if (step > 3 && Math.random() < 0.95) {
                return;
            }

            debug('serializing vbo');
            prevHeader = {
                elements: _.extend(prevHeader.elements, vbos.elements),
                bufferByteLengths: _.extend(prevHeader.bufferByteLengths, vbos.bufferByteLengths)
            };
            fs.writeFileSync(basePath + 'metadata.json', JSON.stringify(prevHeader));
            var buffers = vbos.uncompressed;
            for (var i in buffers) {
                var vboPath = basePath + i + '.vbo';
                var raw = buffers[i];
                var buff = new Buffer(raw.byteLength);
                var arr = new Uint8Array(raw);
                for (var j = 0; j < raw.byteLength; j++) {
                    buff[j] = raw[j];
                }

                fs.writeFileSync(vboPath, buff);

                debug('writing', vboPath, raw.byteLength, buff.length);

                if (!CHECK_AT_EACH_SAVE) {
                    continue;
                }
                checkWrite(vboPath, raw, buff);
            }
            debug('wrote/read', prevHeader, _.keys(buffers));
        }
    };
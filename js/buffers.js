'use strict';

//Declaratively define stock CL buffers used by the simulation and potentially passed to the browser

var debug   = require('debug')('graphistry:graph-viz:buffers');
var _       = require('underscore');

var util    = require('./util.js');


//CL+GL+local vbos & setters will be created/exported, no need to modify anything else
var FIELDS =     ['setterName',     'arrType',      'dims',     'defV'];
var NAMED_CLGL_BUFFERS_SETUP = {
    pointColors: ['setColors',      Uint32Array,    'numPoints', util.rgb(102, 102, 255)],
    pointSizes:  ['setSizes',       Uint8Array,     'numPoints', 4],
    pointTags:   ['setPointTags',   Uint8Array,     'numPoints', 0],
    edgeTags:    ['setEdgeTags',    Uint8Array,     'numEdges',  0]
};

//{<str>: {setterName: str, arrType: Function, dims: string, defV: 'a'}}
var NAMED_CLGL_BUFFERS =
    _.object(_.map(NAMED_CLGL_BUFFERS_SETUP,
        function (cfg, name) {
            return [
                name,
                _.object(cfg.map(function (v, i) { return [FIELDS[i], v]; }))];
        }));


module.exports = {NAMED_CLGL_BUFFERS: NAMED_CLGL_BUFFERS};
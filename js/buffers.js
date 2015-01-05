'use strict';

var debug = require('debug')('graphistry:graph-viz:buffers');


//CL+GL+local vbos & setters will be created/exported, no need to modify anything else
var NAMED_CLGL_BUFFERS = {
    pointColors:    {setter: 'setColors'},
    pointSizes:     {setter: 'setSizes'},
    pointTags:      {setter: 'setPointTags'},
    edgeTags:       {setter: 'setEdgeTags'}
};


module.exports = {NAMED_CLGL_BUFFERS: NAMED_CLGL_BUFFERS};

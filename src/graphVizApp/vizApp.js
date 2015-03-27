'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:vizApp');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');

var shortestpaths   = require('./shortestpaths.js');
var colorpicker     = require('./colorpicker.js');
var controls        = require('./controls.js');
var canvas          = require('./canvas.js');

var poiLib          = require('../poi.js');


// ... -> Observable renderState
function init(socket, $elt, renderState, vboUpdates, workerParams, urlParams) {
    debug('Initializing vizApp.');

    //////////////////////////////////////////////////////////////////////////
    // App State
    //////////////////////////////////////////////////////////////////////////

    var poi = poiLib(socket);
    // Observable DOM
    var labelHover = new Rx.Subject();
    var lastRender = new Rx.Subject();
    var currentlyRendering = new Rx.ReplaySubject(1);
    var settingsChanges = new Rx.ReplaySubject(1);
    settingsChanges.onNext({});


    //////////////////////////////////////////////////////////////////////////
    // Setup
    //////////////////////////////////////////////////////////////////////////

    canvas.setupRendering(lastRender, currentlyRendering);
    var colors = colorpicker($('#foregroundColor'), $('#backgroundColor'), socket);
    var renderStateUpdates = canvas.setupDragHoverInteractions($elt, renderState, colors.backgroundColor,
                settingsChanges, poi, labelHover, lastRender, currentlyRendering);
    shortestpaths($('#shortestpath'), poi, socket);
    controls.init(socket, $elt, renderState, vboUpdates, workerParams, urlParams, settingsChanges);

    return renderStateUpdates;
}


module.exports = init;

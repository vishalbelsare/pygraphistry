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
var ui              = require('../ui.js');
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
    var renderTasks = new Rx.Subject();
    var settingsChanges = new Rx.ReplaySubject(1);
    settingsChanges.onNext({});


    //////////////////////////////////////////////////////////////////////////
    // Setup
    //////////////////////////////////////////////////////////////////////////

    canvas.setupRendering(renderState, renderTasks, vboUpdates);
    var colors = colorpicker($('#foregroundColor'), $('#backgroundColor'), socket);
    var renderStateUpdates = canvas.setupInteractions($elt, renderState, colors.backgroundColor,
                                                      settingsChanges, poi, labelHover, renderTasks);
    shortestpaths($('#shortestpath'), poi, socket);

    var doneLoading = vboUpdates.filter(function (update) {
        return update === 'received';
    }).take(1).do(ui.hideSpinnerShowBody).delay(700);

    controls.init(socket, $elt, renderState, doneLoading, workerParams, urlParams, settingsChanges, poi);

    return renderStateUpdates;
}


module.exports = init;

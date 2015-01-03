'use strict';

/* global FPSMeter */


/**
 * Simple use of client.js with UI bindings
 * @module StreamGL/main
 */


var $               = require('jquery'),
    Rx              = require('rx'),
    debug           = require('debug')('graphistry:StreamGL:main:sc');

var streamClient    = require('./client.js'),
    ui              = require('./ui.js'),
    uberDemo        = require('./uber-demo.js');

/*
Enable debuging output in the console by running:
    localStorage.debug = 'StreamGL:*';
in the console. Disable debug output by running:
    localStorage.removeItem('debug');
*/

console.warn('%cWarning: having the console open can slow down execution significantly!',
    'font-size: 18pt; font-weight: bold; font-family: \'Helvetica Neue\', Helvetica, sans-serif; background-color: rgb(255, 242, 0);');

var QUERY_PARAMS = Object.freeze(ui.getQueryParams());
var DEBUG_MODE = (QUERY_PARAMS.hasOwnProperty('debug') && QUERY_PARAMS.debug !== 'false' &&
        QUERY_PARAMS.debug !== '0');


// Sets up event handlers to display socket errors + disconnects on screen
function displayErrors(socket, $canvas) {
    socket.on('error', function(reason) {
        ui.error('Connection error (reason:', reason, (reason||{}).description, ')');
    });

    socket.on('disconnect', function(reason){
        $canvas.parent().addClass('disconnected');
        ui.error('Disconnected (reason:', reason, ')');
    });

    $('#do-disconnect').click(function(btn) {
        btn.disabled = true;
        socket.disconnect();
    });
}


//CanvasD * <string> ->
//  Replay_1 {
//      vboUpdates: Observable {'start', 'received', 'rendered'},
//      renderState: renderState
//  }
function init(canvas, vizType) {
    debug('Initializing client networking driver', vizType);

    var initialized = new Rx.ReplaySubject(1);

    streamClient.connect(vizType)
        .flatMap(function(nfo) {
            debug('Creating renderer');

            var socket  = nfo.socket;

            displayErrors(socket, $(canvas));

            return streamClient.createRenderer(socket, canvas)
                .map(function(renderState) {
                    debug('Renderer created');
                    return {socket: socket, renderState: renderState};
                });
        })
        .subscribe(
            function(v) {
                var socket = v.socket;
                var renderState = v.renderState;

                var vboUpdates = streamClient.handleVboUpdates(socket, renderState);

                uberDemo(socket, $('.sim-container'), v.renderState);

                initialized.onNext({
                    vboUpdates: vboUpdates,
                    renderState: renderState
                });

            },
            function (err) {
                console.error('error connecting stream client', err, err.stack);
            });

    return initialized;
}


window.addEventListener('load', function(){
    var app = init($('#simulation')[0], 'graph');

    if(DEBUG_MODE) {
        $('html').addClass('debug');


        var renderMeterD =
            $('<div>')
                .addClass('meter').addClass('meter-fps')
                .append(
                    $('<span>')
                        .addClass('flavor')
                        .text('render'));
        $('body').append(renderMeterD);
        var renderMeter = new FPSMeter(renderMeterD.get(0), {
            heat: 1,
            graph: 1,

            maxFps: 45,
            decimals: 0,
            smoothing: 3,
            show: 'fps',

            theme: 'transparent',
        });
        app.subscribe(function (app) {
            app.renderState.get('renderPipeline').subscribe(function (evt) {
                if (evt.start) {
//                    renderMeter.resume();
//                    renderMeter.tickStart();
                } else if (evt.rendered) {
                    renderMeter.tick();
//                    renderMeter.pause();
                }
            });
        });


        var networkMeterD =
            $('<div>')
                .addClass('meter').addClass('meter-network')
                .append(
                    $('<span>')
                        .addClass('flavor')
                        .text('network'));
        $('body').append(networkMeterD);
        var networkMeter = new FPSMeter(networkMeterD.get(0), {
            heat: 1,
            graph: 1,

            maxFps: 10,
            decimals: 0,
            smoothing: 5,
            show: 'fps',

            theme: 'transparent',
        });
        app.subscribe(function (app) {
            app.vboUpdates.subscribe(function(evt) {
                switch (evt) {
                    case 'start':
                        networkMeter.resume();
                        networkMeter.tickStart();
                        break;
                    case 'received':
                        networkMeter.tick();
                        networkMeter.pause();
                        break;
                }
            });
        });

    }

});
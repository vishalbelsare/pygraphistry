'use strict';

// * @module StreamGL/main

/*

    Simple use of client.js with UI bindings

*/


var $               = require('jquery'),
    _               = require('underscore'),
    Rx              = require('rx'),
    debug           = require('debug')('StreamGL:main:sc');

var streamClient    = require('./client.js'),
    ui              = require('./ui.js'),
    interaction     = require('./interaction.js'),
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


function init(canvas) {
    debug('Initializing client networking driver');

    var renderedFrame = new Rx.BehaviorSubject(0);

    streamClient.connect()
        .flatMap(function(socket) {
            debug('Creating renderer');

            displayErrors(socket, $(canvas));

            return streamClient.createRenderer(socket, canvas)
                .map(function(renderState) {
                    debug('Renderer created');

                    interaction.setup($('.sim-container'), renderState);
                    uberDemo(socket);

                    return {socket: socket, renderState: renderState};
                })
        })
        .subscribe(function(v) {
            var socket = v.socket;
            var renderState = v.renderState;

            streamClient.handleVboUpdates(socket, renderState).subscribe(renderedFrame);
        })

    return renderedFrame;
}


window.addEventListener('load', function(){
    var renderedFrame = init($('#simulation')[0], {meter: meter});

    if(DEBUG_MODE) {
        $('html').addClass('debug');
        var meter = new FPSMeter($('body')[0], {
            top: 'auto',
            right: '5px',
            left: 'auto',
            bottom: '5px',

            maxFps: 10,
            decimals: 2,

            theme: 'light',
            heat: true,
            graph: true
        });

        renderedFrame.subscribe(function(elapsed) {
            meter.tick();
        });
    }

});
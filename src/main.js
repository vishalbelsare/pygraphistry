'use strict';

/*

    Simple use of client.js with UI bindings

*/


var $               = require('jquery'),
    _               = require('underscore'),
    debug           = require('debug')('StreamGL:main:sc');

var streamClient    = require('./client.js'),
    ui              = require('./ui.js'),
    interaction     = require('./interaction.js'),
    uberDemo        = require('../../demos/uber/js/main.js');

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


//canvas * {?camera, ?socket} -> {renderFrame: () -> (), setCamera: camera -> () }
function init (canvas, opts) {

    debug('Initializing client networking driver');

    opts = opts || {};

    var client = streamClient(canvas, opts);

    interaction.setupDrag($('.sim-container'), client.camera)
        .merge(interaction.setupScroll($('.sim-container'), client.camera))
        .subscribe(function(newCamera) {
            client.setCamera(newCamera);
            client.renderFrame();
        });


    var highlights = client.localAttributeProxy('highlights');

    var prevIdx = -1;
    ['pointHitmap']
        .map(interaction.setupMousemove.bind('', $('.sim-container'), client.hitTest))
        .forEach(function (hits) {
            hits
                .sample(10)
                .filter(_.identity)
                .subscribe(function (idx) {
                    debug('got idx', idx);
                    if (idx !== prevIdx) {
                        $('.hit-label').text('Location ID: ' + (idx > -1 ? '#' + idx.toString(16) : ''));
                        var dirty = false;
                        if (idx > -1) {
                            debug('enlarging new point', idx);
                            highlights.write(idx, 20);
                            dirty = true;
                        }
                        if (prevIdx > -1) {
                            debug('shrinking old point', prevIdx);
                            highlights.write(prevIdx, 0);
                            dirty = true;
                        }
                        prevIdx = idx;
                        if (dirty) {
                            client.renderFrame();
                        }
                    }

                });
        });


    $('#do-disconnect').click(function(btn) {
        btn.disabled = true;
        client.disconnect();
    });

    client.socket.on('error', function(reason) {
        ui.error('Connection error (reason:', reason, (reason||{}).description, ')');
    });

    client.socket.on('disconnect', function(reason){
        $(canvas).parent().addClass('disconnected');
        ui.error('Disconnected (reason:', reason, ')');
    });

    uberDemo(client);

    return client;
}

window.addEventListener('load', function(){
    var meter;

    if(DEBUG_MODE) {
        $('html').addClass('debug');
        meter = new FPSMeter($('body')[0], {
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
    }

    init($('#simulation')[0], {meter: meter});
});

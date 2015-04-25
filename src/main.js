'use strict';

/* global FPSMeter */


/**
 * Simple use of client.js with UI bindings
 * @module StreamGL/main
 */


var $               = window.$,
    _               = require('underscore'),
    Rx              = require('rx'),
    nodeutil        = require('util'),
    debug           = require('debug')('graphistry:StreamGL:main');
                      require('./rx-jquery-stub');

var ui              = require('./ui.js');
var vizApp          = require('./graphVizApp/vizApp.js');
var monkey          = require('./monkey.js');

//defer choice to after urlParam
var serverClient    = require('./client.js');
var localClient     = require('./localclient.js');


console.warn('%cWarning: having the console open can slow down execution significantly!',
    'font-size: 18pt; font-weight: bold; font-family: \'Helvetica Neue\', Helvetica, sans-serif; background-color: rgb(255, 242, 0);');


//===============


var urlParams = getUrlParameters();


/**
 * Gets the URL param for the dataset
 */
function getUrlParameters() {
    var sPageURL = window.location.search.substring(1);
    var sURLVariables = sPageURL.split('&');
    var params = {};
    for (var i = 0; i < sURLVariables.length; i++){
        var sParameterName = sURLVariables[i].split('=');
        params[sParameterName[0]] = sParameterName[1];
    }

    return params;
}
function isParamTrue (param) {
    var val = (urlParams[param] || '').toLowerCase();
    return val === 'true' || val === '1' || val === 'yes';
}
function isParamFalse (param) {
    var val = (urlParams[param] || '').toLowerCase();
    return val === 'false' || val === '0' || val === 'no';
}


//================



debug('IS_OFFLINE', isParamTrue('offline'));
var streamClient    = isParamTrue('offline') ? localClient : serverClient;
if (isParamTrue('offline') && urlParams.basePath !== undefined) {
    streamClient.basePath(decodeURIComponent(urlParams.basePath));
}


//==================


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

//CanvasD * <string> * Observable renderState->
//  Replay_1 {
//      vboUpdates: Observable {'start', 'received', 'rendered'},
//      renderState: renderState
//  }
function init(canvas, vizType) {
    debug('Initializing client networking driver', vizType);

    var textNum = 0;
    var loadingText = [
        'herding stray GPUs',
        'munching graph data'
    ];
    Rx.Observable.interval(1000).take(2).subscribe(function () {
        $('#load-text').text(loadingText[textNum]);
        textNum++;
    });

    var initialized = new Rx.ReplaySubject(1);

    streamClient.connect(vizType, urlParams)
        .flatMap(function(nfo) {
            var socket  = nfo.socket;
            displayErrors(socket, $(canvas));

            debug('Creating renderer');
            return streamClient.createRenderer(socket, canvas)
                .map(function(initialRenderState) {
                    debug('Renderer created');
                    return {
                        socket: socket,
                        workerParams: nfo.params,
                        initialRenderState: initialRenderState
                    };
                });
        }).do(function(nfo) {
            var vboUpdates = streamClient.handleVboUpdates(nfo.socket, nfo.initialRenderState);
            vizApp(nfo.socket, nfo.initialRenderState, vboUpdates, nfo.workerParams, urlParams);

            initialized.onNext({
                vboUpdates: vboUpdates,
                initialRenderState: nfo.initialRenderState
            });

            vboUpdates
                .filter(function (v) { return v === 'start'; })
                .do(function () {
                    parent.postMessage('start', '*');
                })
                .flatMap(function () {
                    return vboUpdates
                        .filter(function (v) { return v === 'received'; })
                        .take(1);
                })
                .do(function () {
                    parent.postMessage('received', '*');
                })
                .subscribe(_.identity, function (err) { console.error('bad vboUpdate', err); });

        }).subscribe(
            _.identity,
            function (err) {
                var msg = (err||{}).message || 'Error when connecting to visualization server. Try refreshing the page...';
                ui.error('Oops, something went wrong: ', msg);
                ui.hideSpinnerShowBody();
                console.error('General init error', err, (err||{}).stack);
            }
        );

    return initialized;
}

function createInfoOverlay(app) {

    if (!isParamTrue('info')) {
        return;
    }

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
        app.initialRenderState.get('renderPipeline').subscribe(function (evt) {
            if (evt.rendered) {
                renderMeter.tick();
            }
        },
        function (err) { console.error('renderPipeline error', err, (err||{}).stack); });
    }, function (err) { console.error('app error', err, (err||{}).stack); });


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
    app.pluck('vboUpdates').subscribe(function(evt) {
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
        },
        function (err) { console.error('app vboUpdates error', err, (err||{}).stack); });
}

window.addEventListener('load', function() {
    // Patch console calls to forward errors to central
    var loggedFuns = ['error', 'warn'];
    _.each(loggedFuns, function (fun) {
        monkey.patch(console, fun, monkey.after(function () {
            var msg = {
                type: 'console.' + fun,
                content: nodeutil.format.apply(this, arguments)
            };
            $.post(window.location.origin + '/error', JSON.stringify(msg));
        }));
    });

    var tag = urlParams.usertag;
    if (tag !== undefined && tag !== '') {
        if (window.heap) {
            window.heap.identify({handle: tag, name: tag});
        }

        if (window.ga) {
            window.ga('set', 'userId', tag);
        }
    }

    var app = init($('#simulation')[0], 'graph');
    createInfoOverlay(app);


    //def on
    if (isParamTrue('info')) {
        $('html').addClass('info');
    }
    if (isParamTrue('debug')) {
        $('html').addClass('debug');
    }

    //def off
    if (isParamFalse('logo')) {
        $('html').addClass('nologo');
    }
    if (isParamFalse('menu')) {
        $('html').addClass('nomenu');
    }

});

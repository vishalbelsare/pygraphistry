'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('uber:main');
var Rx      = require('rx');
var $       = require('jquery');
var _       = require('underscore');
var Slider  = require('bootstrap-slider');


var interaction = require('./interaction.js');
var renderer = require('./renderer');



function sendSetting(socket, name, value) {
    var payload = {};
    payload[name] = value;

    socket.emit('graph_settings', payload);
    debug('settings', payload);
}


///////////////////////////////////////////////////////////////////////////////
// Event handler setup
///////////////////////////////////////////////////////////////////////////////

//immediate
function renderLabels($eventTarget, renderState, labels) {

    console.log('renderState', renderState.get('hostBuffers'));



}

function setupInteractions($eventTarget, renderState) {
    var currentState = renderState;
    var camera = renderState.get('camera');

    var $labelCont = $('<div>').addClass('graph-label-container');
    $eventTarget.append($labelCont);
    var labels = [1,2,3,4,5].map(function (i) {
        return $('<span>')
            .addClass('graph-label')
            .text('zzz ' + i + ' zzz');
    });
    labels.forEach(function ($lbl) {
        $labelCont.append($lbl);
    });

    var interactions;
    if(interaction.isTouchBased) {
        debug('Detected touch-based device. Setting up touch interaction event handlers.');
        var eventTarget = $eventTarget[0];
        interactions = interaction.setupSwipe(eventTarget, camera)
            .merge(interaction.setupPinch($eventTarget, camera));
    } else {
        debug('Detected mouse-based device. Setting up mouse interaction event handlers.');
        interactions = interaction.setupDrag($eventTarget, camera)
            .merge(interaction.setupScroll($eventTarget, camera));
    }

    interactions
        .subscribe(function(newCamera) {
            currentState = renderer.setCameraIm(renderState, newCamera);
            renderLabels($eventTarget, currentState);
            renderer.render(currentState);
        });


    var highlights = renderer.localAttributeProxy(renderState)('highlights');
    var prevIdx = -1;

    ['pointHitmap']
        .map(interaction.setupMousemove.bind({}, $eventTarget, currentState))
        .forEach(function(hits) {
            hits.sample(10)
                .filter(_.identity)
                .subscribe(function (idx) {
                    debug('Point hitmap got index:', idx);

                    if (idx !== prevIdx) {
                        debug('Hitmap detected mouseover on a new point with index', idx);
                        $('.hit-label').text('Location ID: ' + (idx > -1 ? '#' + idx.toString(16) : ''));

                        var dirty = false;

                        if (idx > -1) {
                            debug('Enlarging current mouseover point', idx);
                            highlights.write(idx, 20);
                            dirty = true;
                        }

                        if (prevIdx > -1) {
                            debug('Shrinking previous mouseover point', prevIdx);
                            highlights.write(prevIdx, 0);
                            dirty = true;
                        }

                        prevIdx = idx;
                        if (dirty) {
                            renderer.render(currentState);
                        }
                    }
                },
                function (err) { console.error('mouse move err', err, err.stack); });
        });
}



function init(socket, $elt, renderState) {

    setupInteractions($elt, renderState);

    //trigger animation on server
    socket.emit('graph_settings', {});

    //TODO try/catch because sc.html does not have tooltip
    try {
        $('#refresh')
            .tooltip()
            .on('click', function () {
                debug('reset_graph');

                socket.emit('reset_graph', {}, function () {
                    debug('page refresh');
                    window.location.reload();
                });
            });
    } catch (e) { }

    var elts = {
        nodeSlider: 'charge',
        edgeStrengthSlider: 'edgeStrength',
        edgeDistSlider: 'edgeDistance',
        gravitySlider: 'gravity'
    };

    $('.menu-slider').each(function () {
        var slider = new Slider(this);
        var name = elts[this.id];

        var slide = Rx.Observable.fromEventPattern(
            function(h) { slider.on('slide', h); },
            function() { /* No 'off' fn in bootstrap-slider */ return; });

        //send to server
        slide
            .distinctUntilChanged()
            .sample(10)
            .merge(Rx.Observable.just(0))   // Send the current value on load
            .map(function() {
                return slider.getValue() / 1000;
            })
            .subscribe(function (val) {
                sendSetting(socket, name, val);
            }, function (err) {
                console.error('nooo', err);
            });
    });
}


module.exports = init;
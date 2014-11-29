'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('uber:main');
var Rx      = require('rx');
var $       = require('jquery');
var _       = require('underscore');
var Slider  = require('bootstrap-slider');


var interaction = require('./interaction.js');
var renderer    = require('./renderer');
var picking     = require('./picking.js');



function sendSetting(socket, name, value) {
    var payload = {};
    payload[name] = value;

    socket.emit('graph_settings', payload);
    debug('settings', payload);
}


var HIGHLIGHT_SIZE = 20;



///////////////////////////////////////////////////////////////////////////////
// Event handler setup
///////////////////////////////////////////////////////////////////////////////

//TODO remove global
//[ {elt: $DOM, idx: int} ]
var activeLabels = {};
var inactiveLabels = [];

function genLabel ($labelCont, txt) {
    var res = $('<span>')
        .addClass('graph-label')
        .css('display', 'none')
        .text(txt);
    $labelCont.append(res);
    return res;
}

// $DOM * RendererState  -> ()
// Immediately reposition each label based on camera and curPoints buffer
var renderLabelsRan = false;
function renderLabels($labelCont, renderState) {

    if (!renderLabelsRan) {
        renderLabelsRan = true;
        var allOn = renderer.localAttributeProxy(renderState)('allHighlighted');
        var amt = renderState.get('hostBuffers').curPoints.buffer.byteLength / (4 * 2);
        for (var i = 0; i < amt; i++) {
            allOn.write(i, HIGHLIGHT_SIZE / 2);
        }
    }


    var t0 = Date.now();

    var samples = renderState.get('pixelreads').pointHitmapDownsampled;
    var samples32 = new Uint32Array(samples.buffer);
    var hits = {};
    for (var i = 0; i < samples32.length; i++) {
        hits[picking.uint32ToIdx(samples32[i])] = true;
    }
    if (hits['-1']) {
        delete hits['-1'];
    }

    var t1 = Date.now();


    //return unused first incase need extra to reuse
    _.values(activeLabels).forEach(function (lbl) {
        if (!hits[lbl.idx]) {
            inactiveLabels.push(lbl);
            delete activeLabels[lbl.idx];
            lbl.elt.css('display','none');
        }
    });

    //select label elts (and make active if needed)
    var labels = _.keys(hits)
        .map(function (idx) {
            if (activeLabels[idx]) {
                return activeLabels[idx];
            } else {
                if (!inactiveLabels.length) {
                    return {
                        idx: idx,
                        elt:  genLabel($labelCont, idx)
                    };
                }
                var lbl = inactiveLabels.pop();
                lbl.idx = idx;
                lbl.elt
                    .text(idx)
                    .css('display', 'block');
                return lbl;
            }
        })
        .filter(_.identity);

    activeLabels = _.object(labels.map(function (lbl) { return [lbl.idx, lbl]; }));


    var t2 = Date.now();

    var curPoints = renderState.get('hostBuffers').curPoints;

    if (!curPoints) {
        console.warn('renderLabels called before curPoints available');
        return;
    }

    var points = new Float32Array(renderState.get('hostBuffers').curPoints.buffer);
    var camera = renderState.get('camera');
    var cnv = $('#simulation').get(0);

    var mtx = camera.getMatrix();
    var newPos = new Float32Array(labels.length * 2);
    for (var i = 0; i < labels.length; i++) {
        var idx = labels[i].idx;
        var pos = camera.canvasCoords(points[2 * idx], -points[2 * idx + 1], 1, cnv, mtx);
        newPos[2 * i] = pos.x;
        newPos[2 * i + 1] = pos.y;
    }

    labels.forEach(function (elt, i) {
        elt.elt.css('left', newPos[2 * i]).css('top', newPos[2 * i + 1]);
    });

    console.log('sampled', t1 - t0, t2 - t1, Date.now() - t2, 'labels:', labels.length, '/', _.keys(hits).length, inactiveLabels.length);

}

function setupInteractions($eventTarget, renderState) {
    var currentState = renderState;
    var camera = renderState.get('camera');

    var $labelCont = $('<div>').addClass('graph-label-container');
    $eventTarget.append($labelCont);
    var labels = _.range(1,500).map(function (i) {
        return genLabel($labelCont, i);
    });
    labels.forEach(function ($lbl, i) {
        var cont = {idx: i, elt: $lbl};
        inactiveLabels.push(cont);
        var isOn = false;
        $lbl
            .on('mouseover', function () {
                if (!isOn) {
                    isOn = true;
                    highlights.write(cont.idx, HIGHLIGHT_SIZE);
                    renderer.render(currentState);
                }
            })
            .on('mouseout', function () {
                if (isOn) {
                    isOn = false;
                    highlights.write(cont.idx, 0);
                    renderer.render(currentState);
                }
            });
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
            renderLabels($labelCont, currentState);
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

                        var points = new Float32Array(renderState.get('hostBuffers').curPoints.buffer);
                        var xtra = idx > -1 ? (' (' + points[2*idx].toFixed(3) + ', ' + points[2*idx+1].toFixed(3) + ')') : '';
                        var lblText = (idx > -1 ? '#' + idx.toString(16) : '') + xtra;
                        $('.hit-label').text('Location ID: ' + lblText);

                        var dirty = false;

                        if (idx > -1) {
                            debug('Enlarging current mouseover point', idx);
                            highlights.write(idx, HIGHLIGHT_SIZE);
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
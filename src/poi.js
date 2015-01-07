'use strict';

// Point-of-interest tracking and rendering
// Idea:
//      -- sample texture to get subset of onscreen labels
//      -- if label switched from on-to-off, check if sampling missed


var debug       = require('debug')('graphistry:StreamGL:poi');
var _           = require('underscore');
var Rx          = require('rx');
var $           = require('jquery');

var picking     = require('./picking.js');

//0--1: the closer to 1, the more likely that unsampled points disappear
var APPROX = 0.3;
var MAX_LABELS = 20;


function makeErrorHandler(name) {
    return function (err) {
        console.error(name, err, (err || {}).stack);
    };
}




function markHits(samples32) {
    var hits = {};
    for (var i = 0; i < samples32.length; i++) {
        hits[picking.uint32ToIdx(samples32[i])] =  true;
    }
    return hits;
}

function topHits(hits) {
    var vals = _.keys(hits).map(function (v) { return parseInt(v); });
    vals.sort();
    vals = vals.slice(0, MAX_LABELS);
    return vals;
}

//renderState * String -> {<idx> -> True}
//dict of points that are on screen -- approx may skip some
function getActiveApprox(renderState, textureName) {

    var samples32 = new Uint32Array(renderState.get('pixelreads')[textureName].buffer);
    var hits = markHits(samples32);

    //only use first MAX_LABEL (sort to make deterministic)
    var vals = topHits(hits);

    var res = {};
    vals.forEach(function (v) {
        res[v] = true;
    });

    //remove null
    if (res['-1']) {
        delete res['-1'];
    }

    return res;
}


//{<idx>: True} * [{elt: $DOM}] * {<idx>: True} * RenderState * [ Float ] -> ()
//  Effects: update inactiveLabels, activeLabels, hits
//return unused activeLabels to inactiveLabels incase need extra to reuse
//(otherwise mark as hit)
//Idea: need to make sure missing not due to overplotting
function finishApprox(activeLabels, inactiveLabels, hits, renderState, points) {

    var camera = renderState.get('camera');
    var cnv = renderState.get('gl').canvas;
    var mtx = camera.getMatrix();

    var toClear = [];


    var cnvCached = {clientWidth: cnv.clientWidth, clientHeight: cnv.clientHeight};

    _.values(activeLabels).forEach(function (lbl) {
        if (!hits[lbl.idx]) {

            var pos = camera.canvasCoords(points[2 * lbl.idx], -points[2 * lbl.idx + 1], 1, cnvCached, mtx);

            var isOffScreen = pos.x < 0 || pos.y < 0 || pos.x > cnvCached.clientWidth || pos.y > cnvCached.clientHeight;
            var isDecayed = (Math.random() > 1 - APPROX) || (_.keys(activeLabels).length > MAX_LABELS);

            if (isOffScreen || isDecayed) {
                //remove
                inactiveLabels.push(lbl);
                delete activeLabels[lbl.idx];
                toClear.push(lbl);
            } else {
                //overplotted, keep
                hits[lbl.idx] = true;
            }
        }
    });

    return toClear;
}

//DOM =======================

//create label, attach to dom
//label texts defined externall; can change idx to update
function genLabel (instance, $labelCont, idx) {


    var setter = new Rx.ReplaySubject(1);

    var $elt = $('<div>')
        .addClass('graph-label')
        .css('display', 'none')
        .empty()
        .html('' + idx);

    $labelCont.append($elt);


    var res = {
        idx: idx,
        elt: $elt,
        setIdx: setter.onNext.bind(setter)
    };

    setter
        .sample(3)
        .do(function (idx) {
            res.idx = idx;
            $elt.empty();
        })
        .flatMapLatest(instance.getLabelText)
        .do(function (htmlStr) {
            if (htmlStr) {
                $elt.html(htmlStr);
            } else {
                $elt.empty();
            }
        })
        .subscribe(_.identity, makeErrorHandler('genLabel fetcher'));

    res.setIdx(idx);

    return res;
}



//NETWORK ===================

//instance * int -> ReplaySubject_1 ?HtmlString
//TODO batch fetches
function getLabelText (instance, idx) {
    if (!instance.state.labelCache[idx]) {
        instance.state.labelCache[idx] = new Rx.ReplaySubject(1);
        instance.state.socket.emit('get_labels', [idx], function (err, data) {
            if (err) {
                console.error('get_labels', err);
            } else {
                instance.state.labelCache[idx].onNext(data[0]);
            }
        });
    }
    return instance.state.labelCache[idx];
}




function init (socket) {
    debug('initializing label engine');

    var instance = { };

    _.extend(instance, {

        state: {

            socket: socket,

            //[ ReplaySubject_1 ?HtmlString ]
            labelCache: [],

            //{<int> -> {elt: $DOM, idx: int} }
            activeLabels: {},

            //[ {elt: $DOM, idx: int} ]
            inactiveLabels: []

        },

        MAX_LABELS: MAX_LABELS,

        // {<int> -> {elt: $DOM, idx: int} } -> ()
        resetActiveLabels: function (activeLabels) {
            instance.state.activeLabels = activeLabels;
        },

        //int -> Subject ?HtmlString
        getLabelText: getLabelText.bind('', instance),

        getActiveApprox: getActiveApprox,
        finishApprox: finishApprox,

        //$DOM * idx -> {elt: $DOM, idx: int, setIdx: Subject int}
        genLabel: genLabel.bind('', instance)
    });

    return instance;

}


module.exports = init;
'use strict';

// Point-of-interest tracking and rendering
// Idea:
//      -- sample texture to get subset of onscreen labels
//      -- if label switched from on-to-off, check if sampling missed


var debug       = require('debug')('graphistry:StreamGL:poi');
var _           = require('underscore');
var sprintf     = require('sprintf-js').sprintf;
var $           = window.$;
var Rx          = require('rx');
                  require('./rx-jquery-stub');

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
    var idx = -1;

    // Approach one (sort -> count)
    // O(NlogN), but less slamming memory
    var sortedSamples = samples32.sort();

    var left = -1;
    var right = -1;
    var runningCount = 0;
    for (var i = 0; i < sortedSamples.length; i++) {
        idx = picking.decodeGpuIndex(sortedSamples[i]);
        right = idx;
        if (right === left) {
            runningCount++;
        } else {
            hits[left] = runningCount;
            left = right;
            runningCount = 1;
        }

    }
    hits[left] = runningCount;


    // Approach two (straight count + incr)
    // O(N), but slams memory

    // for (var i = 0; i < samples32.length; i++) {
    //     idx = picking.decodeGpuIndex(samples32[i]);
    //     hits[idx] = hits[idx] ? hits[idx] + 1 : 1;
    // }

    // Remove misses (-1)
    delete hits[-1];

    return hits;
}

function sortedHits(hits) {
    var indices = _.keys(hits);
    var sortedIndices = indices.sort(function (a, b) {
        return hits[b] - hits[a];
    });

    return sortedIndices;
}

//renderState * String -> {<idx> -> {dim: int}}
//dict of points that are on screen -- approx may skip some
function getActiveApprox(renderState, textureName) {
    var samples32 = new Uint32Array(renderState.get('pixelreads')[textureName].buffer);
    var hits = markHits(samples32);
    var sorted = sortedHits(hits);

    var res = {};
    var limit = Math.min(MAX_LABELS, sorted.length);
    for (var i = 0; i < limit; i++) {
        var idx = sorted[i];
        var key = cacheKey(idx, 1);
        res[key] = {idx: idx, dim: 1};
    }

    return res;
}


//{<idx>: True} * [{elt: $DOM}] * {<idx>: {dim: int}} * RenderState * [ Float ] -> ()
//  Effects: update inactiveLabels, activeLabels, hits
//return unused activeLabels to inactiveLabels incase need extra to reuse
//(otherwise mark as hit)
//Idea: need to make sure missing not due to overplotting
function finishApprox(activeLabels, inactiveLabels, hits, renderState, points) {

    var camera = renderState.get('camera');
    var cnv = renderState.get('gl').canvas;
    var mtx = camera.getMatrix();

    var toClear = [];


    var cnvCached = {width: cnv.width, height: cnv.height};

    _.values(activeLabels).forEach(function (lbl) {
        if (!hits[cacheKey(lbl.idx, lbl.dim)]) {

            var pos = camera.canvasCoords(points[2 * lbl.idx], points[2 * lbl.idx + 1], cnvCached, mtx);

            var isOffScreen = pos.x < 0 || pos.y < 0 || pos.x > cnvCached.width || pos.y > cnvCached.height;
            var isDecayed = (Math.random() > 1 - APPROX) || (_.keys(activeLabels).length > MAX_LABELS);

            if (isOffScreen || isDecayed) {
                //remove
                inactiveLabels.push(lbl);
                delete activeLabels[cacheKey(lbl.idx, lbl.dim)];
                toClear.push(lbl);
            } else {
                //overplotted, keep
                hits[cacheKey(lbl.idx, lbl.dim)] = {idx: lbl.idx, dim: lbl.dim};
            }
        }
    });

    return toClear;
}

function finishAll(activeLabels, inactiveLabels, hits) {
    var toClear = [];

    _.values(activeLabels).forEach(function (lbl) {
        if (!hits[cacheKey(lbl.idx, lbl.dim)]) {
            inactiveLabels.push(lbl);
            delete activeLabels[cacheKey(lbl.idx, lbl.dim)];
            toClear.push(lbl);
        }
    });

    return toClear;
}

//DOM =======================

/**
 * @typedef {Object} LabelIndex
 * @type {number} idx
 * @type {number} dim
 */


//create label, attach to dom
//label texts defined externall; can change idx to update
/**
 * @param instance
 * @param {Element} $labelCont
 * @param {number} idx
 * @param {LabelIndex} info
 * @returns {{idx: *, dim: (number|*|dim), elt: *, setIdx: (function(this:*))}}
 */
function genLabel (instance, $labelCont, idx, info) {


    var setter = new Rx.ReplaySubject(1);

    var $elt = $('<div>')
        .addClass('graph-label')
        .css('display', 'none')
        .empty();

    $labelCont.append($elt);


    var res = {
        idx: idx,
        dim: info.dim,
        elt: $elt,
        setIdx: setter.onNext.bind(setter)
    };

    setter
        .sample(3)
        .do(function (data) {
            res.dim = data.dim;
            res.idx = data.idx;
            $elt.empty();
        })
        .flatMapLatest(instance.getLabelDom)
        .do(function (domTree) {
            if (domTree) {
                $elt.append(domTree);
            } else {
                $elt.empty();
            }
        })
        .subscribe(_.identity, makeErrorHandler('genLabel fetcher'));

    res.setIdx({idx: idx, dim: info.dim});

    return res;
}



//NETWORK ===================

function cacheKey(idx, dim) {
    return String(idx) + ',' + String(dim);
}


function fetchLabel (instance, idx, dim) {
    instance.state.socket.emit('get_labels', {dim: dim, indices: [idx]}, function (err, data) {
        if (err) {
            console.error('get_labels', err);
            return;
        }
        var labelCache = instance.state.labelCache[cacheKey(idx, dim)];
        if (labelCache === undefined) {
            console.warn('label cache entry not found', cacheKey(idx, dim));
        } else {
            labelCache.onNext(createLabelDom(dim, data[0]));
        }
    });
}

function createLabelDom(dim, labelObj) {
    var $cont = $('<div>').addClass('graph-label-container');
    var $pin = $('<i>').addClass('fa fa-lg fa-thumb-tack');
    var $title;
    var $content;
    var $labelType = $('<span>').addClass('label-type').addClass('pull-right');

    if (dim === 2) {
        $cont.addClass('graph-label-edge');
    } else if (dim === 1) {
        $cont.addClass('graph-label-point');
    }

    if (labelObj.formatted) {
        $cont.addClass('graph-label-preset');
        $title = $('<span>').addClass('graph-label-title').append(labelObj.formatted)
                .append($labelType);
    } else {
        // Filter out 'hidden' columns
        // TODO: Encode this in a proper schema instead of hungarian-ish notation
        labelObj.columns = _.filter(labelObj.columns, function (pair) {
            return (pair[0][0] !== '_');
        });

        $cont.addClass('graph-label-default');
        $title = $('<div>').addClass('graph-label-title').append($pin).append(' ' + labelObj.title)
                .append($labelType);
        var $table= $('<table>');
        labelObj.columns.forEach(function (pair) {
            var $row = $('<tr>').addClass('graph-label-pair');
            var $key = $('<td>').addClass('graph-label-key').text(pair[0]);
            var val = pair[1];
            var entry =
                pair[0].indexOf('Date') > -1 && typeof(val) === 'number' ?
                    $.datepicker.formatDate( 'd-M-yy', new Date(val))
                : (!isNaN(val) && val % 1 !== 0) ?
                    sprintf('%.4f', val)
                : sprintf('%s', val);
            var $wrap = $('<div>').addClass('graph-label-value-wrapper').html(entry);
            var $val = $('<td>').addClass('graph-label-value').append($wrap);
            $row.append($key).append($val);
            $table.append($row);
        });
        $content = $('<div>').addClass('graph-label-contents').append($table);
    }

    return {
        labelObj: labelObj,
        labelDOM: $cont.append($title).append($content)
    };
}


//TODO batch fetches
//instance * int -> ReplaySubject_1 {labelObj, labelDOM}
function getLabel(instance, data) {
    // TODO: Make cache aware of both idx and dim
    var idx = data.idx;
    var dim = data.dim;

    if (!instance.state.labelCache[cacheKey(idx, dim)]) {
        instance.state.labelCache[cacheKey(idx, dim)] = new Rx.ReplaySubject(1);
        fetchLabel(instance, idx, dim);
    }
    return instance.state.labelCache[cacheKey(idx, dim)];
}


//instance * int -> ReplaySubject_1 ?DOM
function getLabelDom (instance, data) {
   return getLabel(instance, data).map(function (l) {
       return l.labelDOM;
   });
}


//instance * int -> ReplaySubject_1 LabelObject
function getLabelObject (instance, data) {
   return getLabel(instance, data).map(function (l) {
       return l.labelObj;
   });
}

// instance ->
// Invalidates Cache but does not attempt to refill.
function emptyCache (instance) {
    instance.state.labelCache = {};
    _.each(instance.state.activeLabels, function (val, key) {
        instance.state.inactiveLabels.push(val);
        val.elt.css('display', 'none');
        delete instance.state.activeLabels[key];
    });
}

/**
 * @typedef {Object} POIHandlerState
 * @type {socket.io socket} socket
 * @type {GraphistryClient} client
 * @type {Object} labelCache
 * @type {Object} activeLabels
 * @type {Array} inactiveLabels
 */


/**
 * @typedef {Object} POIHandler
 * @type POIHandlerState state
 * @type number MAX_LABELS
 * @type Function resetActiveLabels
 * @type (function(this:POIHandler)) getLabelDom
 * @type Function getActiveApprox
 * @type Function finishApprox
 * @type (function(this:POIHandler)) genLabel
 * @type (function(this:POIHandler)) invalidateCache
 * @type Function cacheKey
 */


/**
 * @param {socket.io socket} socket
 * @returns POIHandler
 */
function init(socket) {
    debug('initializing label engine');

    var instance = {};

    _.extend(instance, {

        state: {

            socket: socket,

            //[ ReplaySubject_1 ?HtmlString ]
            labelCache: {},

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
        getLabelDom: getLabelDom.bind('', instance),
        getLabelObject: getLabelObject.bind('', instance),

        getActiveApprox: getActiveApprox,
        finishApprox: finishApprox,
        finishAll: finishAll,

        //$DOM * idx -> {elt: $DOM, idx: int, setIdx: Subject int}
        genLabel: genLabel.bind('', instance),

        emptyCache: emptyCache.bind('', instance),

        // int * int -> String
        cacheKey: cacheKey
    });

    return instance;

}


module.exports = init;

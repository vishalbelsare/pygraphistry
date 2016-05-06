'use strict';

// Point-of-interest tracking and rendering
// Idea:
//      -- sample texture to get subset of onscreen labels
//      -- if label switched from on-to-off, check if sampling missed


var debug       = require('debug')('graphistry:StreamGL:poi');
var _           = require('underscore');
var $           = window.$;
var Rx          = require('rxjs/Rx');
                  require('./rx-jquery-stub');
var Color       = require('color');

var picking     = require('./picking.js');
var Identifier  = require('./graphVizApp/Identifier');
var contentFormatter = require('./graphVizApp/contentFormatter.js');

//0--1: the closer to 1, the more likely that unsampled points disappear
var APPROX = 0.5;
var MAX_LABELS = 20;
var TIME_BETWEEN_SAMPLES = 300; // ms

var DimCodes = {
    point: 1,
    edge: 2
};


function makeErrorHandler(name) {
    return (err) => {
        console.error(name, err, (err || {}).stack);
    };
}




function markHits(samples32) {
    var hits = {};
    var idx = -1;


    // Approach one (sort -> count)
    // O(NlogN), but less slamming memory
    Array.prototype.sort.call(samples32, (a, b) => a - b);
    var sortedSamples = samples32;


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
    var sortedIndices = indices.sort((a, b) => hits[b] - hits[a]);

    return sortedIndices;
}


// POI choosing new ones should be throttled to a reasonable amount.
// This is going in POI hit checking to avoid having to manage outside.
var lastRes = {};
var timeOfLastRes = 0;

//renderState * String -> {<idx> -> {dim: int}}
//dict of points that are on screen -- approx may skip some
function getActiveApprox(renderState, textureName, forceResample) {

    // If it hasn't been long enough, just return last hits.
    if (!forceResample && Date.now() - timeOfLastRes < TIME_BETWEEN_SAMPLES) {
        // Clone because we might want to mutate this later
        return _.clone(lastRes);
    }


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


    lastRes = _.clone(res);
    timeOfLastRes = Date.now();
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

    _.values(activeLabels).forEach((lbl) => {
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

    _.values(activeLabels).forEach((lbl) => {
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
        .auditTime(3)
        .do((data) => {
            res.dim = data.dim;
            res.idx = data.idx;
            $elt.empty();
        })
        .switchMap(instance.getLabelDom)
        .do((domTree) => {
            if (domTree) {
                $elt.append(domTree);
            } else {
                $elt[0].style.display = 'none';
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


function fetchLabel (instance, labelCacheEntry, idx, dim) {
    instance.state.socket.emit('get_labels', {dim: dim, indices: [idx]}, (err, labels) => {
        if (err) {
            console.error('get_labels', err);
            return;
        }
        if (labelCacheEntry === undefined) {
            console.warn('label cache entry not found', cacheKey(idx, dim));
            return;
        }
        // TODO: Represent this in a cleaner way from the server
        if (labels[0].title === undefined && labels[0].formatted === undefined) {
            // Invalid label request/response
            labelCacheEntry.onNext(false);
        } else {
            labelCacheEntry.onNext(labels[0]);
        }
    });
}

function queryForKeyAndValue(type, key, value) {
    var identifier = Identifier.clarifyWithPrefixSegment(key, type);
    return {
        ast: {
            type: 'BinaryExpression',
            operator: '=',
            left: {type: 'Identifier', name: identifier},
            right: {type: 'Literal', value: value}
        },
        inputString: Identifier.identifierToExpression(identifier) + ' = ' + JSON.stringify(value)
    };
}

function createLabelDom(instance, dim, labelObj) {
    var $cont = $('<div>').addClass('graph-label-container');
    var $pin = $('<i>').addClass('fa fa-lg fa-thumb-tack');
    var $title;
    var $content;
    var $labelType = $('<span>').addClass('label-type').addClass('pull-right');

    var type = _.findKey(DimCodes, (dimCode) => dimCode === dim);
    $cont.addClass('graph-label-' + type);

    // TODO FIXME HACK labelObj.formatted is injected as HTML; XSS vulnerability assumed (<script> tag)
    if (labelObj.formatted !== undefined && labelObj.formatted !== false) {
        $cont.addClass('graph-label-preset');
        $title = $('<span>').addClass('graph-label-title').append(labelObj.formatted)
                .append($labelType);
    } else {
        // Filter out 'hidden' columns
        // TODO: Encode this in a proper schema instead of hungarian-ish notation
        // Deprecated column format retained by older persist-based static exports of [key, value].
        var oldFormat = _.any(labelObj.columns, (col) => !col.hasOwnProperty('key'));
        labelObj.columns = _.filter(labelObj.columns, (col) => {
            var key = oldFormat ? col[0] : col.key;
            return key[0] !== '_';
        });

        $cont.addClass('graph-label-default');
        $title = $('<div>').addClass('graph-label-title').append($pin).append(' ' + labelObj.title)
                .append($labelType);
        var $table= $('<table>');
        var labelRequests = instance.state.labelRequests;
        labelObj.columns.forEach((col) => {
            var key = oldFormat ? col[0] : col.key,
                val = oldFormat ? col[1] : col.value;

            // Basic null guards:
            if (key === undefined || val === undefined || val === null) {
                return;
            }

            var displayName = col.displayName || contentFormatter.defaultFormat(val, col.dataType);
            // Null value guard
            if (displayName === undefined || displayName === null) {
                return;
            }

            var $row = $('<tr>').addClass('graph-label-pair'),
                $key = $('<td>').addClass('graph-label-key').text(key);

            var $wrap = $('<div>').addClass('graph-label-value-wrapper');

            if (col.dataType === 'color') {
                $wrap
                    .text(displayName)
                    .append($('<span>')
                        .addClass('label-color-pill')
                        .css('background-color', new Color(displayName).rgbString()));

            } else {
                //FIXME .text(..) in secured mode?
                $wrap.html(displayName);
            }

            var $icons = $('<div>').addClass('graph-label-icons');
            $wrap.append($icons);
            var dataOptions = {placement: 'bottom', toggle: 'tooltip'};
            var keyValueEqn = Identifier.clarifyWithPrefixSegment($key.text(), type) + '=' + displayName;
            var $tag = $('<a class="tag-by-key-value beta">').html('<i class="fa fa-tag"></i>');
            $tag.data(dataOptions);
            $tag.attr('title', 'Tag as ' + keyValueEqn);
            $tag.tooltip({container: 'body'})
                .data('bs.tooltip').tip().addClass('label-tooltip'); // so labels can remove
            $tag.on('click', () => {
                labelRequests.onNext({tagQuery: {query: queryForKeyAndValue(type, key, val)}});
            });
            var $exclude = $('<a class="exclude-by-key-value">').html('<i class="fa fa-ban"></i>');
            $exclude.data(dataOptions);
            $exclude.attr('title', 'Exclude if ' + keyValueEqn);
            $exclude.tooltip({container: 'body'})
                .data('bs.tooltip').tip().addClass('label-tooltip'); // so labels can remove
            $exclude.on('click', () => {
                labelRequests.onNext({excludeQuery: {query: queryForKeyAndValue(type, key, val)}});
            });
            var $filter = $('<a class="filter-by-key-value">').html('<i class="fa fa-filter"></i>');
            $filter.data(dataOptions);
            $filter.attr('title', 'Filter for ' + keyValueEqn);
            $filter.tooltip({container: 'body'})
                .data('bs.tooltip').tip().addClass('label-tooltip'); // so labels can remove
            $filter.on('click', () => {
                labelRequests.onNext({filterQuery: {query: queryForKeyAndValue(type, key, val)}});
            });
            $icons.append($tag).append($exclude).append($filter);

            var $val = $('<td>').addClass('graph-label-value').append($wrap);
            $row.append($key).append($val);
            $table.append($row);
        });
        $content = $('<div>').addClass('graph-label-contents').append($table);
    }
    $cont.append($title).append($content);

    return $cont;
}


//TODO batch fetches
//instance * int -> ReplaySubject_1 labelObj
function getLabel(instance, data) {
    // TODO: Make cache aware of both idx and dim
    var idx = data.idx;
    var dim = data.dim;

    var key = cacheKey(idx, dim),
        cache = instance.state.labelCache;
    if (!cache[key]) {
        var labelObs = new Rx.ReplaySubject(1);
        cache[key] = labelObs;
        fetchLabel(instance, labelObs, idx, dim);
    }
    return cache[key];
}


//instance * int -> ReplaySubject_1 ?DOM
function getLabelDom (instance, data) {
    return getLabel(instance, data).map((l) => {
        if (!l) {
            return l;
        }
        return createLabelDom(instance, data.dim, l);
    });
}

// instance ->
// Invalidates Cache but does not attempt to refill.
function emptyCache (instance) {
    instance.state.labelCache = {};
    _.each(instance.state.activeLabels, (val, key) => {
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
 * @param {Rx.Subject} labelRequests
 * @returns POIHandler
 */
function init(socket, labelRequests) {
    debug('initializing label engine');

    var instance = {};

    _.extend(instance, {

        state: {

            socket: socket,

            // Rx.Subject
            labelRequests: labelRequests,

            //[ ReplaySubject_1 labelObj ]
            labelCache: {},

            //[ $DOM ]
            labelDOMCache: {},

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
        getLabelObject: getLabel.bind('', instance),

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

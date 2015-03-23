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
    for (var i = 0; i < samples32.length; i++) {
        hits[picking.decodeGpuIndex(samples32[i]).idx] =  true;
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


    var cnvCached = {width: cnv.width, height: cnv.height};

    _.values(activeLabels).forEach(function (lbl) {
        if (!hits[lbl.idx]) {

            var pos = camera.canvasCoords(points[2 * lbl.idx], points[2 * lbl.idx + 1], cnvCached, mtx);

            var isOffScreen = pos.x < 0 || pos.y < 0 || pos.x > cnvCached.width || pos.y > cnvCached.height;
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
        .flatMapLatest(instance.getLabelDom)
        .do(function (domTree) {
            if (domTree) {
                $elt.append(domTree);
            } else {
                $elt.empty();
            }
        })
        .subscribe(_.identity, makeErrorHandler('genLabel fetcher'));

    res.setIdx(idx);

    return res;
}



//NETWORK ===================


function fetchLabel (instance, idx) {
    instance.state.socket.emit('get_labels', [idx], function (err, data) {
        if (err) {
            console.error('get_labels', err);
        } else {
            instance.state.labelCache[idx].onNext(createLabelDom(data[0]));
        }
    });
}

function createLabelDom(labelObj) {
    var $cont = $('<div>').addClass('graph-label-container');
    var $pin = $('<i>').addClass('fa fa-lg fa-thumb-tack');
    var $title;
    var $content;

    if (labelObj.formatted) {
        $cont.addClass('graph-label-preset');
        $title = $('<span>').addClass('graph-label-title').append(labelObj.formatted);
    } else {
        $cont.addClass('graph-label-default');
        $title = $('<span>').addClass('graph-label-title').append($pin).append(' ' + labelObj.title);
        var $table= $('<table>');
        labelObj.columns.forEach(function (pair) {
            var $row = $('<tr>').addClass('graph-label-pair');
            var $key = $('<td>').addClass('graph-label-key').text(pair[0]);
            var val = pair[1];
            var entry = (!isNaN(val) && val % 1 !== 0) ? sprintf('%.4f', val) : sprintf('%s', val);
            var $wrap = $('<div>').addClass('graph-label-value-wrapper').text(entry);
            var $val = $('<td>').addClass('graph-label-value').append($wrap);
            $row.append($key).append($val);
            $table.append($row);
        });
        $content = $('<div>').addClass('graph-label-contents').append($table);
    }

    return $cont.append($title).append($content);
}

//instance * int -> ReplaySubject_1 ?HtmlString
//TODO batch fetches
function getLabelDom (instance, idx) {
    if (!instance.state.labelCache[idx]) {
        instance.state.labelCache[idx] = new Rx.ReplaySubject(1);
        fetchLabel(instance, idx);
    }
    return instance.state.labelCache[idx];
}


// ?[ idx ] -> bool
function invalidateCache (instance, idxs) {
    var indices = idxs ? idxs : _.keys(instance.state.labelCache);
    indices.forEach(function (idx) {
        idx = parseInt(idx);

        //TODO to be correct, we should mark existing remapping ones as inprogress
        //however, chances are, it won't move, so this avoids *some* flickr, though we still see some
        //instance.state.labelCache[idx].onNext('(fetching)');

        fetchLabel(instance, idx);
    });
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
        getLabelDom: getLabelDom.bind('', instance),

        getActiveApprox: getActiveApprox,
        finishApprox: finishApprox,

        //$DOM * idx -> {elt: $DOM, idx: int, setIdx: Subject int}
        genLabel: genLabel.bind('', instance),

        // ?[ idx ] -> bool
        invalidateCache: invalidateCache.bind('', instance)
    });

    return instance;

}


module.exports = init;

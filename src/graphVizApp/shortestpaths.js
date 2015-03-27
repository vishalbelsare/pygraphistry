'use strict';

var debug   = require('debug')('graphistry:StreamGL:shortestpaths');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');

//poi * labelDOM -> int U exn
function getLabelIndex(poi, elt) {
    for (var idx in poi.state.activeLabels) {
        var lbl = poi.state.activeLabels[idx].elt.get(0);
        if (elt === lbl) {
            return poi.state.activeLabels[idx].idx;
        }
    }
    throw new Error({msg: 'Could not find index for label', val: $(elt).html()});
}

// poi -> Observable int
function nextSelectedLabel (poi) {
    return Rx.Observable.merge(
        Rx.Observable.fromEvent($('#highlighted-point-cont'), 'click')
            .map(function () { return parseInt($('#highlighted-point-cont').attr('pointIdx')); })
            .filter(function (v) { return !isNaN(v); }),
        Rx.Observable.fromEvent($('body'), 'click')
            .pluck('target')
            .filter(function (v) { return v && $(v).hasClass('graph-label'); })
            .map(getLabelIndex.bind('', poi)))
        .take(1);
}


module.exports = function ($btn, poi, socket) {

    Rx.Observable.fromEvent($btn, 'click')
        .do(function () {
            $btn.find('.fa').toggleClass('toggle-on', true);
        })
        .flatMapLatest(function () {

            //TODO why is this red?
            var RED = 255 << 8;

            return nextSelectedLabel(poi)
                .flatMap(function (startIdx) {
                    socket.emit('highlight_points', [{index: startIdx, color: RED}]);
                    return nextSelectedLabel(poi)
                        .map(function (endIdx) {
                            socket.emit('highlight_points', [{index: endIdx, color: RED}]);
                            return [startIdx, endIdx];
                        });
                });
        })
        .do(function (pair) {
            debug('run shortestpaths', pair);
            $btn.find('.fa').toggleClass('toggle-on', false);
            socket.emit('shortest_path', pair);
        })
        .subscribe(
            function (v) { debug('shortestpaths', v); },
            function (err) { console.error('err', err); });

};

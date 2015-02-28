'use strict';

var $       = window.$;
var Rx      = require('rx');
              require('./rx-jquery-stub');

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
    return Rx.Observable.fromEvent($('body'), 'click')
        .pluck('target')
        .filter(function (v) { return v && $(v).hasClass('graph-label'); })
        .take(1)
        .map(getLabelIndex.bind('', poi));
}


module.exports = function ($btn, poi, socket) {

    Rx.Observable.fromEvent($btn, 'click')
        .do(function () {
            $btn.find('.fa').toggleClass('toggle-on', true);
        })
        .flatMapLatest(function () {

            console.log('started', poi);

            return nextSelectedLabel(poi)
                .flatMap(function (startIdx) {
                    console.log('first point', startIdx);
                    return nextSelectedLabel(poi)
                        .map(function (endIdx) {
                            console.log('second point', endIdx);
                            return [startIdx, endIdx];
                        });
                });
        })
        .do(function (pair) {
            console.log('highlighting path..');
            $btn.find('.fa').toggleClass('toggle-on', false);
            socket.emit('shortest_path', pair);
        })
        .subscribe(
            function (v) { console.log('hit', v); },
            function (err) { console.error('err', err); });

};
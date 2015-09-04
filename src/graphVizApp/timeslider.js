'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:timeslider');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var filterer = require('./filter.js');

module.exports = {
    init: function (appState, socket/*, urlParams*/) {
        var MAX_BOUNDS  = 1000;
        // var START       = 1380003953000;
        // var END         = 1380483953000;
        var START       = 1376995086000 - 1;
        var END         = 1381498590000 + 1;


        // var defaults = {min: MAX_BOUNDS/5, max:MAX_BOUNDS - MAX_BOUNDS/5};
        var defaults = {min: 10, max:MAX_BOUNDS - 10};

        var hits = new Rx.Subject();

        $('#timeSlider2')
            .css({display: 'block'})
            .editRangeSlider({
                valueLabels: 'hide',
                defaultValues: defaults,
                bounds: {min: 0, max: MAX_BOUNDS}})
            .bind('valuesChanging', function (e, data) {
                hits.onNext([data.values.min, data.values.max]);
            });

        hits.sample(100).subscribe(function (v) {
            var len = END - START;
            var start = START + len * v[0] / MAX_BOUNDS;
            var stop = END - len * (MAX_BOUNDS - v[1]) / MAX_BOUNDS;
            debug('emit filter', v, '->', [start, stop]);
            filterer.filterObservable(socket, filterer.filterRangeParameters('edge', 'Date', start, stop));
        });

        //FIXME kickoff may fire before filterRange defined
        setTimeout(function () {
            hits.onNext([defaults.min, defaults.max]);
        }, 2000);

    }
};

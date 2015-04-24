'use strict';

//var debug   = require('debug')('graphistry:StreamGL:graphVizApp:runButton');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util            = require('./util.js');



var INTERACTION_INTERVAL = 40;



//appState ->  ()
module.exports = function (appState, socket, urlParams, isAutoCentering) {

    var $tooltips = $('[data-toggle="tooltip"]');
    var $bolt = $('#simulate .fa');
    var numTicks = urlParams.play !== undefined ? urlParams.play : 5000;

    var disable = Rx.Observable.merge(
        $('#marqueerectangle').onAsObservable('click'),
        $('#histogramBrush').onAsObservable('click'));

    // Tick stream until canceled/timed out (end with 'false'), starts after first vbo update.
    var autoLayingOut =
        Rx.Observable.merge(
            Rx.Observable.return(Rx.Observable.interval(20)),
            Rx.Observable.merge(
                    $('#simulate').onAsObservable('click')
                        .filter(function (evt){ return evt.originalEvent !== undefined; }),
                    disable,
                    Rx.Observable.timer(numTicks))
                .take(1)
                .map(_.constant(Rx.Observable.return(false))))
        .flatMapLatest(_.identity);

    var runLayout =
        Rx.Observable.fromEvent($('#simulate'), 'click')
            .map(function () { return $bolt.hasClass('toggle-on'); })
            .merge(disable.map(_.constant(true)))
            .do(function (wasOn) {
                $bolt.toggleClass('toggle-on', !wasOn);
            })
            .flatMapLatest(function (wasOn) {
                var isOn = !wasOn;
                appState.simulateOn.onNext(isOn);
                return isOn ? Rx.Observable.interval(INTERACTION_INTERVAL) : Rx.Observable.empty();
            });

    runLayout
        .subscribe(
            function () { socket.emit('interaction', {play: true, layout: true}); },
            util.makeErrorHandler('Error stimulating graph'));

    autoLayingOut.subscribe(
        function (evt) {
            if (evt !== false) {
                var payload = {play: true, layout: true};
                socket.emit('interaction', payload);
            }
        },
        util.makeErrorHandler('autoLayingOut error'),
        function () {
            isAutoCentering.take(1).subscribe(function (v) {
                if (v !== false) {
                    $('#center').trigger('click');
                }
            });
            $tooltips.tooltip('hide');
            $bolt.removeClass('automode').removeClass('toggle-on');
            appState.simulateOn.onNext(false);
        });


};
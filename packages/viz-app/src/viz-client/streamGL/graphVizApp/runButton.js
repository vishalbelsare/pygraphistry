'use strict';

//var debug   = require('debug')('graphistry:StreamGL:graphVizApp:runButton');
import $ from 'jquery'
import { Observable } from 'rxjs';

const _       = require('underscore');

const util            = require('./util.js');
const api             = require('./api.js');



const INTERACTION_INTERVAL = 40;



module.exports = function (appState, socket, urlParams, isAutoCentering) {

    const $tooltips = $('[data-toggle="tooltip"]');
    const $graph = $('#simulate');
    const $bolt = $('.fa', $graph);
    const numTicks = urlParams.play !== undefined ? urlParams.play : 5000;

    const disable = Observable.merge(
        $('#viewSelectionButton').onAsObservable('click'),
        $('#histogramBrush').onAsObservable('click'));

    // Tick stream until canceled/timed out (end with 'false'), starts after first vbo update.
    const autoLayingOut =
        Observable.merge(
            Observable.return(Observable.interval(20)),
            Observable.merge(
                $graph.onAsObservable('click')
                    .filter((evt) => evt.originalEvent !== undefined),
                disable,
                Observable.timer(numTicks)
            ).take(1).map(_.constant(Observable.return(false))))
        .switchMap(_.identity);

    const runActions =
        appState.apiActions
            .filter((e) => { return e.event === 'toggleLayout'; })
            .map((e) => { return e.play || false; });

    const runLayout =
        Observable.fromEvent($graph, 'click')
            .map(() => { return $bolt.hasClass('toggle-on'); })
            .merge(disable.map(_.constant(true)))
            .merge(runActions.map((play) => !play))
            .do((wasOn) => {
                $bolt.toggleClass('toggle-on', !wasOn);
                $bolt.toggleClass('automode', !wasOn);
            })
            .switchMap((wasOn) => {
                const isOn = !wasOn;
                appState.simulateOn.onNext(isOn);
                return isOn ? Observable.interval(INTERACTION_INTERVAL) : Observable.empty();
            });

    runLayout
        .subscribe(
            () => {
                socket.emit('interaction', {play: true, layout: true});
            },
            util.makeErrorHandler('Error stimulating graph'));

    autoLayingOut.subscribe(
        (evt) => {
            if (evt !== false) {
                const payload = {play: true, layout: true};
                socket.emit('interaction', payload);
            } else {
                api.postEvent(appState.apiEvents, undefined, {event: 'ready'});
            }
        },
        util.makeErrorHandler('autoLayingOut error'),
        () => {
            isAutoCentering.take(1).subscribe((v) => {
                if (v !== false) {
                    $('#center').trigger('click');
                }
            });
            $tooltips.tooltip('hide');
            $bolt.removeClass('automode').removeClass('toggle-on');
            appState.simulateOn.onNext(false);
        });


};

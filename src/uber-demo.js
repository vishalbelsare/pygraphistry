'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('uber:main');
var Rx      = require('rx');
var $       = require('jquery');
var Slider  = require('bootstrap-slider');


function init(socket) {
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

        //from global bootstra-slider scope
        var slider = new Slider(this);

        var name = elts[this.id];

        var slide = new Rx.Subject();
        slider.on('slide', function () { slide.onNext(slider.getValue()); });

        //send to server
        slide
            .distinctUntilChanged()
            .sample(10)
            .subscribe(function (v) {
                var val = v / 1000;

                var payload = {};
                payload[name] = val;

                socket.emit('graph_settings', payload);
                debug('settings', payload);

            }, function (err) {
                console.error('nooo', err);
            });
    });
}


module.exports = init;
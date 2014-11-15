'use strict';

var debug   = require('debug')('uber:main');
var Rx      = require('rx');
var $       = require('jquery');

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
        var $this = $(this);

        $(this).slider();

        var name = elts[this.id];

        //send to server
        Rx.Observable
            .fromEvent($(this), 'slide')
            .sample(10)
            .distinctUntilChanged(function () {
                return $this.slider('getValue');
            })
            .subscribe(function () {
                var v = $this.slider('getValue');
                var val = (v < 0 ? -1 : 1) * Math.sqrt(Math.abs(v))/1000;
                var payload = {};
                payload[name] = val;

                socket.emit('graph_settings', payload);
                debug('settings', payload);

            });
    });
}


module.exports = init;
'use strict';

var $               = window.$;
var _               = require('underscore');
var Rx              = require('rx');
                      require('../rx-jquery-stub');
var Handlebars = require('handlebars');

var util            = require('./util.js');


module.exports = function (socket) {
    var $btn = $('#forkButton');

    Rx.Observable.fromEvent($btn, 'click')
        .map(function () {
             return $(Handlebars.compile($('#forkTemplate').html())(
                {defName: 'Graph_' + (1+Math.random()*2000000000).toString(16).slice(0).replace('.','')}));
        })
        .do(function ($modal) {
             $('body').append($modal);
             $('.status', $modal).css('display','none');
             $modal.modal('show');
        })
        .flatMap(function ($modal) {
            return Rx.Observable.fromEvent($('.modal-footer button', $modal), 'click')
                .map(_.constant($modal));
        })
        .do(function ($modal) {
            $('.status', $modal).css('display','inline');
            $('.modal-footer button', $modal).css('display', 'none');
        })
        .flatMap(function ($modal) {
            var name = $('.modal-body input', $modal).val();
            return Rx.Observable.fromCallback(socket.emit, socket)('fork_vgraph', name)
                .map(function (reply) {
                    return {reply: reply, $modal: $modal};
                });
        })
        .do(function (pair) {
            var reply = pair.reply;
            var $modal = pair.$modal;
            if (!reply || !reply.success)  {
                throw new Error({msg: 'Server error on inspectHeader', v: (reply||{}).error});
            } else {
                $('.modal-body', $modal)
                    .empty()
                    .append($('<span>').text('Static copy at: '))
                    .append($('<a>')
                        .text(reply.data)
                        .attr('href',reply.data));
                $('.status', $modal).css('display','none');
            }
        })
        .subscribe(_.identity,
            function (err) {
                try { $('.forker').remove(); } catch (e) { }
                util.makeErrorHandler('exn forking vgraph', err);
            });

};
'use strict';

var $               = window.$;
var _               = require('underscore');
var Rx              = require('rx');
                      require('../rx-jquery-stub');
var Handlebars = require('handlebars');

var util            = require('./util.js');


function nameToLink (urlParams, name) {
    var overrides = {static: true, contentKey: name},
        params    = _.extend({}, _.omit(urlParams), overrides), // extend() to cascade, omit() to mute options.
        paramStr  = _.map(params, function (v, k) { return k + '=' + v; }).join('&');
    return window.location.origin + window.location.pathname + '?' + paramStr;
}


function generateContentKey(urlParams) {
    var uid = util.createAlphaNumericUID(),
        parts = urlParams.dataset.split('/'),
        suffix = parts.slice(-parts.length + 1);
    return suffix + '_' + uid;
}


module.exports = function (socket, urlParams) {
    var $btn = $('#persistButton');

    if (urlParams.static === 'true') {
        $btn.remove();
        return;
    }

    Rx.Observable.fromEvent($btn, 'click')
        // show
        .map(function () {
            var contentKey = urlParams.contentKey || generateContentKey(urlParams);
            return $(Handlebars.compile($('#persistTemplate').html())(
                {defName: contentKey}));
        })
        .do(function ($modal) {
            $('body').append($modal);
            $('.status', $modal).css('display', 'none');
            $modal.modal('show');
        })
        .flatMap(function ($modal) {
            return Rx.Observable.fromEvent($('.modal-footer button', $modal), 'click')
                .map(_.constant($modal));
        })
        // notify server & wait
        .do(function ($modal) {
            $('.status', $modal).css('display', 'inline');
            $('.modal-footer button', $modal).css('display', 'none');
        })
        .flatMap(function ($modal) {
            var name = $('.modal-body input', $modal).val();
            return Rx.Observable.fromCallback(socket.emit, socket)('persist_current_vbo', name)
                .map(function (reply) {
                    return {reply: reply, $modal: $modal};
                });
        })
        // show
        .do(function (pair) {
            var reply = pair.reply;
            if (!(reply && reply.success)) {
                throw new Error({msg: 'Server error on inspectHeader', v: (reply || {error: 'unknown'}).error});
            }
            var $modal = pair.$modal,
                url = nameToLink(urlParams, reply.name);
            $('.modal-body', $modal)
                .empty()
                .append($('<span>').text('Static copy at: '))
                .append($('<a>')
                    .attr('target', '_blank')
                    .text(url)
                    .attr('href', url));
            $('.status', $modal).css('display', 'none');
        })
        .subscribe(_.identity,
            function (err) {
                console.error('err', err);
                try { $('.persistor').remove(); } catch (ignore) { }
                util.makeErrorHandler('Exception while persisting VBOs', err);
            });

};

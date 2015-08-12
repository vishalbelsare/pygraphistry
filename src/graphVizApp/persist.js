'use strict';

var $               = window.$;
var _               = require('underscore');
var Rx              = require('rx');
                      require('../rx-jquery-stub');
var Handlebars = require('handlebars');

var util            = require('./util.js');
var staticclient    = require('../staticclient.js');

/**
 * Returns a URL string for the export specified.
 * @param {Camera2d} camera
 * @param {Object} urlParams
 * @param {string} name
 * @returns {string}
 */
function getExportURL (camera, urlParams, name) {
    // static+contentKey identify static content
    // TODO: Infer play/center settings from static=true on load to avoid these overrides.
    var overrides = {static: true, contentKey: name, play: 0, center: false},
        boundsArray = camera.getBounds(),
        bounds    = {left: boundsArray[0], right: boundsArray[1], top: boundsArray[2], bottom: boundsArray[3]},
        params    = _.extend({}, urlParams, overrides, bounds),
        paramStr  = _.map(params, function (v, k) { return k + '=' + v; }).join('&');
    return window.location.origin + window.location.pathname + '?' + paramStr;
}


function generateContentKey(urlParams) {
    var uid = util.createAlphaNumericUID(),
        parts = urlParams.dataset.split('/'),
        suffix = parts.slice(-parts.length + 1);
    return suffix + '_' + uid;
}


module.exports = function (appState, socket, urlParams) {
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
            var contentKey = $('.modal-body input', $modal).val();
            return Rx.Observable.fromCallback(socket.emit, socket)('persist_current_vbo', contentKey)
                .map(function (reply) {
                    return {reply: reply, $modal: $modal, contentKey: contentKey};
                });
        })
        .flatMap(function (response) {
            var contentKey = response.reply.name || response.contentKey,
                $canvas = $('canvas#simulation')[0],
                previewDataURL = $canvas.toDataURL('image/png');
            if (!contentKey) {
                throw new Error('No content key provided: ', response);
            }
            return Rx.Observable.fromCallback(socket.emit, socket)('persist_upload_png_export', previewDataURL, contentKey, 'preview.png')
                .map(function () {
                    return response;
                })
        })
        // show
        .do(function (response) {
            var reply = response.reply;
            if (!(reply && reply.success)) {
                throw new Error({msg: 'Server error on inspectHeader', v: (reply || {error: 'unknown'}).error});
            }
            var renderState = appState.renderState,
                camera = renderState.get('camera'),
                $modal = response.$modal,
                targetURL = getExportURL(camera, urlParams, reply.name),
                previewURL = staticclient.getStaticContentURL(reply.name, 'preview.png');
            var embedElement = $('<a>')
                .attr('target', '_blank')
                .append($('<img>')
                    .attr('height', 150)
                    //.attr('width', 150)
                    .attr('src', previewURL))
                .attr('href', targetURL);
            $('.modal-body', $modal)
                .empty()
                //.append($('<p>')
                //    .append($('<span>').text('Direct link: '))
                //    .append($('<a>')
                //        .attr('target', '_blank')
                //        .text(targetURL)
                //        .attr('href', targetURL)))
                .append($('<p>')
                    .append($('<span>').text('Preview:'))
                    .append(embedElement))
                .append($('<p>')
                    .append($('<span>').text('HTML:'))
                    .append($('<textarea>')
                        .text(embedElement.outerHTML)));
            $('.status', $modal).css('display', 'none');
        })
        .subscribe(_.identity,
            function (err) {
                console.error('err', err);
                try { $('.persistor').remove(); } catch (ignore) { }
                util.makeErrorHandler('Exception while persisting VBOs', err);
            });

};

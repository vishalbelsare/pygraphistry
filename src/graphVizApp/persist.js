'use strict';

const $               = window.$;
const _               = require('underscore');
const Rx              = require('rxjs/Rx.KitchenSink');
                        require('../rx-jquery-stub');
const Handlebars      = require('handlebars');
const Color           = require('color');

const util            = require('./util.js');
const staticclient    = require('../staticclient.js');
const marquee         = require('./marquee.js');
const Command         = require('./command.js');


function joinEscapedParams (paramKeysAndEscapedValues) {
    return _.map(paramKeysAndEscapedValues, (paramValue, paramName) => paramName + '=' + paramValue).join('&');
}

/**
 * Returns a URL string for the export specified.
 * @param {Camera2d} camera - the current/desired viewport.
 * @param {Object} urlParams - the original view URL parameters, mostly carried over.
 * @param {string} contentKey - the key for the server into the content where the export resides.
 * @param {string} backgroundColor - the background color string from CSS.
 * @returns {string}
 */
function getExportURL (camera, urlParams, contentKey, backgroundColor) {
    // static+contentKey identify static content
    const overrides = {
        static: true, contentKey: contentKey,
        play: 0, center: false, // TODO: Infer these play/center settings from static=true on load.
        menu: false, goLive: false
    };
    const boundsArray = _.map(camera.getBounds(), (value) => value.toPrecision(3));
    const bounds    = {left: boundsArray[0], right: boundsArray[1], top: boundsArray[2], bottom: boundsArray[3]};
    if (backgroundColor) {
        overrides.bg = encodeURIComponent(backgroundColor);
    }
    const params    = _.extend({}, urlParams, overrides, bounds);
    const paramStr  = joinEscapedParams(params);
    return window.location.origin + window.location.pathname + '?' + paramStr;
}


function getWorkbookURL (urlParams, workbookName) {
    const override = {workbook: workbookName};
    const params = _.extend({}, urlParams, override);
    const paramStr  = joinEscapedParams(params);
    return window.location.origin + window.location.pathname + '?' + paramStr;
}


function generateContentKey (urlParams) {
    const uid = util.createAlphaNumericUID();
    const datasetParam = urlParams.dataset;
    const parts = datasetParam.split('/');
    if (parts.length === 2) {
        return datasetParam + '_' + uid;
    } else if (datasetParam.match(/\.json$/)) {
        // return datasetParam.replace(/\.json$/, '_' + uid + '.json');
        return datasetParam.replace(/\/dataset\.json$/, '_' + uid + '/dataset.json');
    } else {
        throw new Error('Unrecognized form in dataset URL parameter: ' + datasetParam);
    }
}


module.exports = {
    setupPersistWorkbookButton: ($btn, appState, socket, urlParams) => {
        let workbookName = urlParams.workbook;

        Rx.Observable.fromEvent($btn, 'click')
            .map(() => {
                return $(Handlebars.compile($('#persistWorkbookTemplate').html())(
                    {defName: workbookName}));
            })
            .do(($modal) => {
                $('body').append($modal);
                $('.status', $modal).css('display', 'none');
                $modal.modal('show');
            })
            .flatMap(($modal) => {
                return Rx.Observable.fromEvent($('.modal-footer button', $modal), 'click')
                    .map(_.constant($modal));
            })
            // notify server and wait
            .do(($modal) => {
                $('.persist-status-text', $modal).text('Saving workbook');
                $('.status', $modal).css('display', 'inline');
                $('.modal-footer button', $modal).css('display', 'none');
            })
            .flatMap(($modal) => {
                workbookName = $('.modal-body input', $modal).val();
                return Rx.Observable.bindCallback(socket.emit.bind(socket))('persist_current_workbook', workbookName)
                    .map((reply) => {
                        return {reply: reply, $modal: $modal, workbookName: workbookName};
                    });
            })
            .do((response) => {
                const {reply, $modal} = response;
                if (!(reply && reply.success)) {
                    throw new Error({msg: 'Server error on inspectHeader', v: (reply || {error: 'unknown'}).error});
                }
                const targetURL = getWorkbookURL(urlParams, response.workbookName);
                const previewElement = $('<a>')
                        .attr('target', '_blank')
                        .text(workbookName)
                        .attr('href', targetURL);
                $('.persist-workbook-form-area', $modal)
                    .hide();
                $('.status, .persist-status-text', $modal).css('display', 'none');
                $('.workbook-preview', $modal)
                    .empty()
                    .append($('<p>')
                        .append(previewElement));
            })
            .subscribe(_.identity,
            (err) => {
                console.error('err', err);
                try { $('.persistWorkbook').remove(); } catch (ignore) { }
                util.makeErrorHandler('Exception while persisting workbook', err);
            });
    },
    setupPersistLayoutButton: ($btn, appState, socket, urlParams) => {
        if (urlParams.static === 'true') {
            $btn.remove();
            return;
        }

        Rx.Observable.fromEvent($btn, 'click')
            // show
            .map(() => {
                const contentKey = urlParams.contentKey || generateContentKey(urlParams);
                return $(Handlebars.compile($('#persistLayoutTemplate').html())(
                    {defName: contentKey}));
            })
            .do(($modal) => {
                $('body').append($modal);
                $('.status', $modal).css('display', 'none');
                $modal.modal('show');
            })
            .flatMap(($modal) => {
                return Rx.Observable.fromEvent($('.modal-footer button', $modal), 'click')
                    .map(_.constant($modal));
            })
            // notify server & wait
            .do(($modal) => {
                $('.persist-status-text', $modal).text('Saving graph');
                $('.status', $modal).css('display', 'inline');
                $('.modal-footer button', $modal).css('display', 'none');
            })
            .flatMap(($modal) => {
                const contentKey = $('.modal-body input', $modal).val();
                return Rx.Observable.bindCallback(socket.emit.bind(socket))('persist_current_vbo', contentKey)
                    .map((reply) => {
                        return {reply: reply, $modal: $modal, contentKey: contentKey};
                    });
            })
            .flatMap((response) => {
                // The colorpicker sets background color via CSS, so we match it thus:
                return marquee.getGhostImageObservable(appState.renderState, undefined, 'image/png', true)
                    .map((imageDataURL) => {
                        response.imageDataURL = imageDataURL;
                        // TODO Fix this to just grab any non-default Color setting:
                        const backgroundColor = $('#simulation').css('backgroundColor');
                        if (backgroundColor && !backgroundColor.match('^rgba?\\(0+, 0+, 0+[,)]')) {
                            response.backgroundColor = new Color(backgroundColor);
                        }

                        return response;
                    });
            })
            .do((response) => {
                $('.persist-status-text', response.$modal)
                    .text('Uploading screenshot (' +
                    (response.imageDataURL.length / (1024 * 1024)).toFixed(1) +
                    'MB)');
            })
            .flatMap((response) => {
                //FIXME upload concurrently w/ save
                const contentKey = response.reply.name || response.contentKey;
                const previewDataURL = response.imageDataURL;
                if (!contentKey || !previewDataURL) {
                    throw new Error('No content provided: ', response);
                }
                const uploadScreenshotCommand = new Command('Upload PNG', 'persist_upload_png_export', socket);
                return uploadScreenshotCommand.sendWithObservableResult(previewDataURL, contentKey, 'preview.png')
                    .map(() => response);
            })
            // show
            .do((response) => {
                const reply = response.reply;
                if (!(reply && reply.success)) {
                    const errorMessage = (reply || {error: 'unknown'}).error;
                    throw new Error({msg: 'Server error on uploading screenshot', v: errorMessage});
                }
                const renderState = appState.renderState;
                const camera = renderState.get('camera');
                const $modal = response.$modal;
                const backgroundColor = response.backgroundColor;
                const targetURL = getExportURL(camera, urlParams, reply.name, backgroundColor && backgroundColor.hexString());
                const previewURL = staticclient.getStaticContentURL(reply.name, 'preview.png');
                const previewElement = $('<a>')
                        .attr('target', '_blank')
                        .append($('<img>')
                            .attr('height', 150)
                            // .attr('width', 150)
                            .attr('src', previewURL)
                            // TODO: extract these into LESS and use a class attribute:
                            .css({
                                'min-width': 150,
                                'min-height': 150,
                                'background-color': backgroundColor || $('.graphistry-body').css('backgroundColor')
                            }))
                        .attr('href', targetURL);
                $('.snapshot-form-area', $modal)
                    .hide();
                $('.snapshot-preview', $modal)
                    .empty()
                    .append($('<p>')
                        .append($('<a>')
                            .attr('target', '_blank')
                            .text('URL for IFrame embed')
                            .attr('href', targetURL)))
                    .append($('<p>')
                        .append($('<p>').text('Preview:'))
                        .append(previewElement))
                    .append($('<p>')
                        .text('Direct HTML:'))
                    .append($('<p>')
                        .append($('<textarea>')
                            .text(previewElement[0].outerHTML)
                            .css('width', '100%')));
                $('.status, .persist-status-text', $modal).css('display', 'none');
            })
            .subscribe(_.identity,
            (err) => {
                console.error('err', err);
                try { $('.persistLayout').remove(); } catch (ignore) { }
                util.makeErrorHandler('Exception while persisting VBOs', err);
            });

    }
};

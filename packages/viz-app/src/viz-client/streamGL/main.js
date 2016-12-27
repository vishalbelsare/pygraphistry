'use strict';

/* global FPSMeter */

/**
 * Simple use of client.js with UI bindings
 * @module StreamGL/main
 */

var Rx              = require('rxjs');

Rx.Observable.return = function (value) {
    return Rx.Observable.of(value);
};

Rx.Subject.prototype.onNext = Rx.Subject.prototype.next;
Rx.Subject.prototype.onError = Rx.Subject.prototype.error;
Rx.Subject.prototype.onCompleted = Rx.Subject.prototype.complete;
Rx.Subject.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;
Rx.AsyncSubject.prototype.onNext = Rx.AsyncSubject.prototype.next;
Rx.AsyncSubject.prototype.onCompleted = Rx.AsyncSubject.prototype.complete;
Rx.BehaviorSubject.prototype.onNext = Rx.BehaviorSubject.prototype.next;
Rx.ReplaySubject.prototype.onNext = Rx.ReplaySubject.prototype.next;

Rx.Subscriber.prototype.onNext = Rx.Subscriber.prototype.next;
Rx.Subscriber.prototype.onError = Rx.Subscriber.prototype.error;
Rx.Subscriber.prototype.onCompleted = Rx.Subscriber.prototype.complete;
Rx.Subscriber.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;

Rx.Subscription.prototype.dispose = Rx.Subscription.prototype.unsubscribe;

import $ from 'jquery'
const _               = require('underscore');
const nodeutil        = require('util');
const util            = require('./graphVizApp/util.js');
const debug           = require('debug')('graphistry:StreamGL:main');

const ui              = require('./ui.js');
const vizApp          = require('./graphVizApp/vizApp.js');
const monkey          = require('./monkey.js');

// defer choice to after urlParam
const serverClient    = require('./client.js');
const localClient     = require('./localclient.js');
const staticClient    = require('./staticclient.js');

// ===============


/**
 * @typedef {Object} GraphistryURLParams
 * @property {String?} usertag - sets userId for analytics, has some customer validation qualities.
 * @property {Boolean?} beta - defaults to false, enables loading features in beta.
 * @property {Boolean?} debug - defaults to false, implies beta but also ensures JavaScript debuggability.
 * @property {Boolean?} info - defaults to false.
 * @property {Boolean?} logo - bool, defaults to true, can override to disable Graphistry brand/logo.
 * @property {Boolean?} menu - bool, defaults to true, can override to disable menu.
 * @property {Boolean?} offline - bool, defaults to false, indicates whether to use localClient to load local files.
 * @property {String?} basePath - related to offline, specifies the path prefix to find the local files.
 * @property {String?} workbook - name of the workbook to load
 * @property {String?} view - name of the view in the workbook to load
 * @property {String?} dataset - name of the dataset to load
 * @property {Number?} splashAfter - double, number of seconds to wait while loading.
 * @property {Boolean?} static - bool, defaults to false, indicates whether to load static content.
 * @property {String?} contentKey - specific to static, specifies prefix to find the static content.
 * @property {String?} bg - hex color, URI-encoded, indicates the DOM background color to use instead of default.
 * @property {String?} camera - defaults to '2d', can also be '3d'
 */

$.urlParam = function(name){
    const results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results === null) {
        return null;
    }
    else{
        return results[1] || 0;
    }
};

/**
 * Gets the URL param for the dataset
 * @return GraphistryURLParams
 */
function getUrlParameters() {
    const query = window.location.search.substring(1);
    const queryParts = query.split('&');

    return _.chain(queryParts)
        .map(function decodeParam(param) {
            const ps = param.split('=');

            const key = decodeURIComponent(ps.shift());
            const value = decodeURIComponent(ps.join('='));

            // const valNorm = valRaw.toLowerCase();
            switch (value.toLowerCase()) {
                case 'true':
                case 'yes':
                case '':
                    return [key, true];
                case 'false':
                case 'no':
                    return [key, false];
                case 'null':
                    return [key, null];
            }

            if (!isNaN(value)) {
                return [key, Number(value)];
            }

            return [key, value];
        })
        .filter(function filterEmptyParams(paramKV) { return paramKV.length !== 0; })
        .object()
        .value();
}
const urlParams = getUrlParameters();
debug('Parsed URL parameters:', urlParams);


//==================


// Sets up event handlers to display socket errors + disconnects on screen
function displayErrors(socket, $canvas) {
    socket.on('error', (reason) => {
        ui.error('Connection error (reason:', reason, (reason || {}).description, ')');
    });

    socket.on('disconnect', (reason) => {
        $canvas.parent().addClass('disconnected');
        ui.error(
            $('<span>')
                .text('Disconnected (reason:' + reason + '). ')
                .append($('<a>')
                    .text('Reload the frame.')
                    .click(() => {
                        document.location.reload();
                    })));
    });
}

function handleLoadingMessages(socket) {
    const INITIAL_MESSAGE = 'Herding stray GPUs';
    const $loadText = $('#load-text');

    socket.on('update_loading_status', (data) => {
        const message = data.message;
        // TODO: Use the percentage
        // const percentage = data.message;

        $loadText.text(message);
    });

    $loadText.text(INITIAL_MESSAGE);
}

//CanvasD * <string> * Observable renderState->
//  Replay_1 {
//      vboUpdates: Observable {'start', 'received', 'rendered'},
//      renderState: renderState
//  }
function init(streamClient, canvasElement, vizType) {
    debug('Initializing client networking driver', vizType);

    const apiEvents = new Rx.Subject();
    let apiActions = new Rx.Subject();

    if (urlParams.embedded) {
        apiEvents.do((e) => {
            parent.postMessage(e, '*');
        }).subscribe(_.identity, util.makeErrorHandler('postMessage apiEvents'));
        apiEvents.onNext({subscriberID: '*', body: {event: 'init'}});

        apiActions = Rx.Observable.fromEvent(window, 'message').filter((msg) => {
            return msg && msg.data && msg.data.event;
        }).map((msg) => {
            return msg.data;
        });
    }

    apiActions.do((msg) => {
        debug('apiActions', msg);
    }).subscribe(_.identity, util.makeErrorHandler('apiActions'));

    /** @typedef {Object} RenderInfo
     * @property {socket} socket
     * @property {string} uri
     * @property {renderer} initialRenderState
     **/

    streamClient.connect(vizType, urlParams)
        .flatMap((nfo) => {
            /** @param {RenderInfo} nfo */
            const socket  = nfo.socket;
            handleLoadingMessages(socket);
            displayErrors(socket, $(canvasElement));
            apiEvents.onNext({event: 'workerConnected', uri: nfo.uri});

            debug('Creating renderer');
            return streamClient.createRenderer(socket, canvasElement, urlParams)
                .map(/** @param {renderer} initialRenderState @returns {RenderInfo} */ (initialRenderState) => {
                    debug('Renderer created');
                    return {
                        socket: socket,
                        uri: nfo.uri,
                        initialRenderState: initialRenderState
                    };
                });
        }).do(/** @param {RenderInfo} nfo */ (nfo) => {
            const vboUpdateWrapper = streamClient.handleVboUpdates(nfo.socket, nfo.uri, nfo.initialRenderState);
            const vboUpdates = vboUpdateWrapper.vboUpdates;
            const vboVersions = vboUpdateWrapper.vboVersions;
            vizApp(nfo.socket, nfo.initialRenderState, vboUpdates, vboVersions, apiEvents, apiActions, nfo.uri, urlParams);
            if (urlParams.debug) {
                createInfoOverlay(nfo.initialRenderState, vboUpdates);
            }
        }).subscribe(
            _.identity,
            (err) => {
                const msg = (err || {}).message || 'Error when connecting to visualization server. Try refreshing the page...';
                ui.error('Oops, something went wrong: ', msg);
                ui.hideSpinnerShowBody();
                util.makeErrorHandler('General init error')(err);
            }
        );
}

function createInfoOverlay(initialRenderState, vboUpdates) {
    const renderMeterD =
        $('<div>')
            .addClass('meter').addClass('meter-fps')
            .append(
                $('<span>')
                    .addClass('flavor')
                    .text('render'));
    const $body = $('body');
    $body.append(renderMeterD);
    const renderMeter = new FPSMeter(renderMeterD.get(0), {
        heat: 1,
        graph: 1,

        maxFps: 45,
        decimals: 0,
        smoothing: 3,
        show: 'fps',

        theme: 'transparent'
    });
    initialRenderState.get('renderPipeline').do((evt) => {
        if (evt.rendered) {
            renderMeter.tick();
        }
    }).subscribe(_.identity, util.makeErrorHandler('renderPipeline error'));

    const networkMeterD =
        $('<div>')
            .addClass('meter').addClass('meter-network')
            .append(
                $('<span>')
                    .addClass('flavor')
                    .text('network'));
    $body.append(networkMeterD);
    const networkMeter = new FPSMeter(networkMeterD.get(0), {
        heat: 1,
        graph: 1,

        maxFps: 10,
        decimals: 0,
        smoothing: 5,
        show: 'fps',

        theme: 'transparent'
    });
    vboUpdates.do((evt) => {
        switch (evt) {
            case 'start':
                networkMeter.resume();
                networkMeter.tickStart();
                break;
            case 'received':
                networkMeter.tick();
                networkMeter.pause();
                break;
        }
    }).subscribe(_.identity, util.makeErrorHandler('app vboUpdates error'));
}

function createSpinner() {
    const opts = {
        lines: 13, // The number of lines to draw
        length: 0, // The length of each line
        width: 15, // The line thickness
        radius: 30, // The radius of the inner circle
        corners: 1, // Corner roundness (0..1)
        rotate: 0, // The rotation offset
        direction: 1, // 1: clockwise, -1: counterclockwise
        color: 'rgb(245,245,253)', // #rgb or #rrggbb or array of colors
        speed: 1, // Rounds per second
        trail: 60, // Afterglow percentage
        shadow: false, // Whether to render a shadow
        hwaccel: true, // Whether to use hardware acceleration
        className: 'spinner', // The CSS class to assign to the spinner
        zIndex: 2e9, // The z-index (defaults to 2000000000)
        top: '50%', // Top position relative to parent
        left: '50%' // Left position relative to parent
    };
    const spinner = new window.Spinner(opts).spin();
    const $text = $('<div>').attr('id', 'load-text').text('locating graphistry\'s farm');
    const $spinner = $(spinner.el);
    const $reload = $('<a>').attr('href', '#').attr('id', 'retry-load').text('Reload').click(() => {
        document.location.reload();
    }).hide();

    $spinner.append($text).append($reload).hide();
    $('<div>').addClass('load-spinner').append($spinner).appendTo($('body'));

    $spinner.fadeIn(300);
    setTimeout(() => {
        $('#retry-load').fadeIn(200);
    }, 8000);
}

function launch(streamClient, urlParams) {
    createSpinner();

    // URL info parameter can ???
    if (urlParams.info) {
        $('html').addClass('info');
    }
    // URL debug parameter can ???
    if (urlParams.debug) {
        $('html').addClass('debug');
    }

    // Removes beta class from elements:
    if (urlParams.beta) {
        $('.beta').removeClass('beta');
    }

    // URL logo parameter can disable the logo via CSS:
    if (urlParams.logo === false) {
        $('html').addClass('nologo');
    }
    // URL menu parameter can disable the menu/marquee entirely via CSS:
    if (urlParams.menu === false) {
        $('html').addClass('nomenu');
    }

   init(streamClient, $('#simulation')[0], 'graph', urlParams);
}

function initAnalytics(urlParams) {
    let title = '';
    if (urlParams.dataset) {
        title = urlParams.dataset;
        if (urlParams.static) {
            title += ' (exported)';
        }
    } else if (urlParams.workbook) {
        title = urlParams.workbook;
    }
    const joiner = ' — ';
    const companyProductLabel = 'Graphistry\'s Graph Explorer';
    document.title = title ? (title + joiner + companyProductLabel) : companyProductLabel;

    const ga = window.ga;
    if (ga) {
        ga('create', 'UA-59712214-1', 'auto');
        ga('require', 'linkid', 'linkid.js');
        ga('send', 'pageview');

        const tag = urlParams.usertag;
        if (tag !== undefined && tag !== '') {
            ga('set', 'userId', tag);
        }
    }
}

function setupErrorReporters (urlParams) {
    function makeMsg(type, level) {
        return {
            module: 'streamgl',
            time: (new Date()).toUTCString(),
            metadata: {
                debugId: window.graphistryDebugId
            },
            userAgent: window.navigator.userAgent,
            params: urlParams,
            origin: document.location.origin,
            type: type,
            level: level
        };
    }

    const reportURL = window.templatePaths.API_ROOT + 'error';

    // Create a id to track this session/pageload all he way across our stack
    let d = new Date().getTime();
    window.graphistryDebugId = 'xxxx-xxxx'.replace(/[x]/g, () => {
        const r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return r.toString(16);
    }).toUpperCase();

    if (window.location.hostname.endsWith('graphistry.com')) {
        console.info('Logs:',
                     'https://splunk.graphistry.com:3000/en-US/app/search/session_inspector?form.debugid=' + window.graphistryDebugId);
    } else {
        console.info('Graphistry Debug Id:', window.graphistryDebugId);
    }

    // Track JavaScript errors
    // Use the new standard (2014+) to get stack from modern browsers
    // https://html.spec.whatwg.org/multipage/webappapis.html#errorevent
    window.onerror = function(message, file, line, col, error) {
        const content = {
            message: message,
            filename: file,
            line: line,
            col: col,
            stack: (error || {}).stack
        };

        const msg = makeMsg('JSError', 50);
        msg.err = content;

        $.post(reportURL, msg);
    };

    // Track AJAX errors (jQuery API)
    $(document).ajaxError((e, request, settings, thrownError) => {
        // Skip ajaxError caused by posting errors to /error
        const errorPage = '/error';
        if (settings.url.indexOf(errorPage, settings.url.length - errorPage.length) !== -1) {
            return;
        }

        const msg = makeMsg('AjaxError', 50);
        msg.err = {
            url: settings.url,
            result: e.result,
            message: thrownError,
            stack: (new Error(thrownError)).stack
        };

        $.post(reportURL, msg);
    });

    // Patch console calls to forward errors to central
    const loggedConsoleFunctions = ['error', 'warn'];
    _.each(loggedConsoleFunctions, (fun) => {
        monkey.patch(console, fun, monkey.after((...args) => {
            const msg = makeMsg('console.' + fun, fun === 'warn' ? 40 : 50);
            const e = new Error(nodeutil.format(...args));

            const peeledStack = _.filter(e.stack.split('\n'), (l) => {
                return l.indexOf('Console') === -1;
            });

            msg.err = {
                message: e.message,
                stack: peeledStack.join('\n')
            };

            $.post(reportURL, msg);
        }));
    });

    const msg = makeMsg('info', 30);
    msg.msg = 'StreamGL downloaded';
    $.post(reportURL, msg);
}

window.addEventListener('load', () => {
    // setupErrorReporters(urlParams);

    initAnalytics(urlParams);

    debug('IS_OFFLINE', urlParams.offline);
    debug('IS_STATIC', urlParams.static);
    let streamClient = null;
    if (urlParams.offline) {
        streamClient = localClient;
        if (urlParams.basePath !== undefined) {
            streamClient.setPath(urlParams.basePath);
        }
    } else if (urlParams.static) {
        streamClient = staticClient;
    } else {
        streamClient = serverClient;
    }

});

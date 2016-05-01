'use strict';

/* global FPSMeter */

require('source-map-support').install();

/**
 * Simple use of client.js with UI bindings
 * @module StreamGL/main
 */

var Rx              = require('rxjs/Rx.KitchenSink');

Rx.Observable.return = function (value) {
    return Rx.Observable.of(value);
};

Rx.Subject.prototype.onNext = Rx.Subject.prototype.next;
Rx.Subject.prototype.onError = Rx.Subject.prototype.error;
Rx.Subject.prototype.onCompleted = Rx.Subject.prototype.complete;
Rx.Subject.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;

Rx.Subscriber.prototype.onNext = Rx.Subscriber.prototype.next;
Rx.Subscriber.prototype.onError = Rx.Subscriber.prototype.error;
Rx.Subscriber.prototype.onCompleted = Rx.Subscriber.prototype.complete;
Rx.Subscriber.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;

Rx.Subscription.prototype.dispose = Rx.Subscription.prototype.unsubscribe;

var $               = window.$;
var _               = require('underscore');
var nodeutil        = require('util');
var util            = require('./graphVizApp/util.js');
var debug           = require('debug')('graphistry:StreamGL:main');

var ui              = require('./ui.js');
var vizApp          = require('./graphVizApp/vizApp.js');
var monkey          = require('./monkey.js');

// defer choice to after urlParam
var serverClient    = require('./client.js');
var localClient     = require('./localclient.js');
var staticClient    = require('./staticclient.js');

console.warn('%cWarning: having the console open can slow down execution significantly!',
    'font-size: 18pt; font-weight: bold; font-family: \'Helvetica Neue\', Helvetica, sans-serif; background-color: rgb(255, 242, 0);');


// ===============


/**
 * @typedef {Object} GraphistryURLParams
 * @property {String?} usertag - sets userId for analytics, has some customer validation qualities.
 * @property {Boolean?} beta - defaults to false, enables loading features in beta.
 * @property {Boolean?} debug - defaults to false, implies beta but also ensures JavaScript debuggability.
 * @property {Boolean?} info - defaults to false.
 * @property {Boolean?} logo - bool, defaults to true, can override to disable Graphistry brand/logo.
 * @property {Boolean?} menu - bool, defaults to true, can override to disable menu.
 * @property {Boolean?} offline - bool, defaults to false, indicates whether to use localClient to load from local files.
 * @property {String?} basePath - related to offline, specifies the path prefix to find the local files.
 * @property {String?} workbook - name of the workbook to load
 * @property {String?} view - name of the view in the workbook to load
 * @property {Number?} splashAfter - double, number of seconds to wait while loading.
 * @property {Boolean?} static - bool, defaults to false, indicates whether to load static content instead of connect live.
 * @property {String?} contentKey - specific to static, specifies prefix to find the static content.
 * @property {String?} bg - hex color, URI-encoded, indicates the DOM background color to use instead of default.
 * @property {String?} camera - defaults to '2d', can also be '3d'
 */

$.urlParam = function(name){
    var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
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
    var query = window.location.search.substring(1);
    var queryParts = query.split('&');

    return _.chain(queryParts)
        .map(function decodeParam(param) {
            var ps = param.split('=');

            var key = decodeURIComponent(ps.shift());
            var value = decodeURIComponent(ps.join('='));

            // var valNorm = valRaw.toLowerCase();
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
var urlParams = getUrlParameters();
debug('Parsed URL parameters:', urlParams);


//==================


// Sets up event handlers to display socket errors + disconnects on screen
function displayErrors(socket, $canvas) {
    socket.on('error', function (reason) {
        ui.error('Connection error (reason:', reason, (reason || {}).description, ')');
    });

    socket.on('disconnect', function (reason) {
        $canvas.parent().addClass('disconnected');
        ui.error(
            $('<span>')
                .text('Disconnected (reason:' + reason + '). ')
                .append($('<a>')
                    .text('Reload the frame.')
                    .click(function () {
                        document.location.reload();
                    })));
    });
}

function handleLoadingMessages(socket) {
    var INITIAL_MESSAGE = 'Herding stray GPUs';
    var $loadText = $('#load-text');

    socket.on('update_loading_status', function (data) {
        var message = data.message;
        // TODO: Use the percentage
        // var percentage = data.message;

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

    var apiEvents = new Rx.Subject();
    var apiActions = new Rx.Subject();

    if (urlParams.embedded) {
        apiEvents.do(function (e) {
            parent.postMessage(e, '*');
        }).subscribe(_.identity, util.makeErrorHandler('postMessage apiEvents'));
        apiEvents.onNext({subscriberID: '*', body: {event: 'init'}});

        apiActions = Rx.Observable.fromEvent(window, 'message').filter(function (msg) {
            return msg && msg.data && msg.data.event;
        }).map(function (msg) {
            return msg.data;
        });
    }

    apiActions.do(function (msg) {
        debug('apiActions', msg);
    }).subscribe(_.identity, util.makeErrorHandler('apiActions'));

    /** @typedef {Object} RenderInfo
     * @property {socket} socket
     * @property {string} uri
     * @property {renderer} initialRenderState
     **/

    streamClient.connect(vizType, urlParams)
        .flatMap(function (nfo) {
            /** @param {RenderInfo} nfo */
            var socket  = nfo.socket;
            handleLoadingMessages(socket);
            displayErrors(socket, $(canvasElement));
            apiEvents.onNext({event: 'workerConnected', uri: nfo.uri});

            debug('Creating renderer');
            return streamClient.createRenderer(socket, canvasElement, urlParams)
                .map(/** @param {renderer} initialRenderState @returns {RenderInfo} */ function (initialRenderState) {
                    debug('Renderer created');
                    return {
                        socket: socket,
                        uri: nfo.uri,
                        initialRenderState: initialRenderState
                    };
                });
        }).do(/** @param {RenderInfo} nfo */ function (nfo) {
            var vboUpdateWrapper = streamClient.handleVboUpdates(nfo.socket, nfo.uri, nfo.initialRenderState);
            var vboUpdates = vboUpdateWrapper.vboUpdates;
            var vboVersions = vboUpdateWrapper.vboVersions;
            vizApp(nfo.socket, nfo.initialRenderState, vboUpdates, vboVersions, apiEvents, apiActions, nfo.uri, urlParams);
            if (urlParams.debug) {
                createInfoOverlay(nfo.initialRenderState, vboUpdates);
            }
        }).subscribe(
            _.identity,
            function (err) {
                var msg = (err || {}).message || 'Error when connecting to visualization server. Try refreshing the page...';
                ui.error('Oops, something went wrong: ', msg);
                ui.hideSpinnerShowBody();
                util.makeErrorHandler('General init error')(err);
            }
        );
}

function createInfoOverlay(initialRenderState, vboUpdates) {
    var renderMeterD =
        $('<div>')
            .addClass('meter').addClass('meter-fps')
            .append(
                $('<span>')
                    .addClass('flavor')
                    .text('render'));
    var $body = $('body');
    $body.append(renderMeterD);
    var renderMeter = new FPSMeter(renderMeterD.get(0), {
        heat: 1,
        graph: 1,

        maxFps: 45,
        decimals: 0,
        smoothing: 3,
        show: 'fps',

        theme: 'transparent'
    });
    initialRenderState.get('renderPipeline').do(function (evt) {
        if (evt.rendered) {
            renderMeter.tick();
        }
    }).subscribe(_.identity, util.makeErrorHandler('renderPipeline error'));

    var networkMeterD =
        $('<div>')
            .addClass('meter').addClass('meter-network')
            .append(
                $('<span>')
                    .addClass('flavor')
                    .text('network'));
    $body.append(networkMeterD);
    var networkMeter = new FPSMeter(networkMeterD.get(0), {
        heat: 1,
        graph: 1,

        maxFps: 10,
        decimals: 0,
        smoothing: 5,
        show: 'fps',

        theme: 'transparent'
    });
    vboUpdates.do(function (evt) {
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
    var opts = {
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
    var spinner = new window.Spinner(opts).spin();
    var $text = $('<div>').attr('id', 'load-text').text('locating graphistry\'s farm');
    var $spinner = $(spinner.el);
    var $reload = $('<a>').attr('href', '#').attr('id', 'retry-load').text('Reload').click(function () {
        document.location.reload();
    }).hide();

    $spinner.append($text).append($reload).hide();
    $('<div>').addClass('load-spinner').append($spinner).appendTo($('body'));

    $spinner.fadeIn(300);
    setTimeout(function () {
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
    var title = '';
    if (urlParams.dataset) {
        title = urlParams.dataset;
        if (urlParams.static) {
            title += ' (exported)';
        }
    } else if (urlParams.workbook) {
        title = urlParams.workbook;
    }
    var joiner = ' — ';
    var companyProductLabel = 'Graphistry\'s Graph Explorer';
    document.title = title ? (title + joiner + companyProductLabel) : companyProductLabel;

    var ga = window.ga;
    if (ga) {
        ga('create', 'UA-59712214-1', 'auto');
        ga('require', 'linkid', 'linkid.js');
        ga('send', 'pageview');

        var tag = urlParams.usertag;
        if (tag !== undefined && tag !== '') {
            ga('set', 'userId', tag);
        }
    }
}

function setupErrorReporters(urlParams) {
    function makeMsg(type, level) {
        return {
            module: 'streamgl',
            time: (new Date()).toUTCString(),
            userAgent: window.navigator.userAgent,
            params: urlParams,
            origin: document.location.origin,
            type: type,
            level: level
        };
    }
    var reportURL = window.templatePaths.API_ROOT + 'error';

    // Track JavaScript errors
    // Use the new standard (2014+) to get stack from modern browsers
    // https://html.spec.whatwg.org/multipage/webappapis.html#errorevent
    window.onerror = function(message, file, line, col, error) {
        var content = {
            message: message,
            filename: file,
            line: line,
            col: col,
            stack: (error || {}).stack
        };

        var msg = makeMsg('JSError', 50);
        msg.err = content;

        $.post(reportURL, msg);
    };

    // Track AJAX errors (jQuery API)
    $(document).ajaxError(function(e, request, settings, thrownError) {
        // Skip ajaxError caused by posting errors to /error
        var errorPage = '/error';
        if (settings.url.indexOf(errorPage, settings.url.length - errorPage.length) !== -1) {
            return;
        }

        var msg = makeMsg('AjaxError', 50);
        msg.err = {
            url: settings.url,
            result: e.result,
            message: thrownError,
            stack: (new Error(thrownError)).stack
        };

        $.post(reportURL, msg);
    });

    // Patch console calls to forward errors to central
    var loggedConsoleFunctions = ['error', 'warn'];
    _.each(loggedConsoleFunctions, function (fun) {
        monkey.patch(console, fun, monkey.after(function () {
            var msg = makeMsg('console.' + fun, fun === 'warn' ? 40 : 50);
            var e = new Error(nodeutil.format.apply(this, arguments));

            var peeledStack = _.filter(e.stack.split('\n'), function (l) {
                return l.indexOf('Console') === -1;
            });

            msg.err = {
                message: e.message,
                stack: peeledStack.join('\n')
            };

            $.post(reportURL, msg);
        }));
    });
}

window.addEventListener('load', function () {
    setupErrorReporters(urlParams);

    initAnalytics(urlParams);

    debug('IS_OFFLINE', urlParams.offline);
    debug('IS_STATIC', urlParams.static);
    var streamClient = null;
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

    if (urlParams.splashAfter === undefined || Date.now() / 1000 <= urlParams.splashAfter ||
        urlParams.offline || urlParams.static) {

        launch(streamClient, urlParams);
    } else {
        var clickHandler = function() {
            $('.splash').fadeOut(100, function () {
                $(this).empty();
                launch(streamClient, urlParams);
            });
        };
        var $logo = $('<img>').attr('src', 'img/logowhite.png').click(clickHandler);
        var $golink = $('<a>').attr('href', '#').attr('id', 'go-load')
                              .text('Launch Visualization').click(clickHandler);
        var $span = $('<span>').append($golink);
        $('<div>').attr('class', 'splash').append($logo).append($span).prependTo($('body'));
    }
});

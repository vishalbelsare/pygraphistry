'use strict';

var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util            = require('./util.js');


/**
 * @param {Socket} socket
 * @param {VizSlice} slice
 * @returns {Rx.Observable}
 */
function encodeEntities(socket, slice) {
    return Rx.Observable.fromCallback(socket.emit, socket)('get_global_ids', slice.getVizSliceElements())
        .do(function (reply) {
            if (!reply || !reply.success) {
                console.error('Server error on get_global_ids', (reply||{}).error);
            }
        }).filter(function (reply) {
            return reply && reply.success;
        }).map(function (reply) {
            return reply.ids;
        });
}


function setupAPIHooks(socket, appState, doneLoading) {
    var apiEvents = appState.apiEvents;
    var apiActions = appState.apiActions;

    var event2subscribers = {};
    var subscriber2event = {};

    apiActions.filter(function (action) {
        return action.event === '__subscribe__';
    }).do(function (action) {
        var targetEvent = action.subscriber.target;
        var subscribers = event2subscribers[targetEvent] || [];
        event2subscribers[targetEvent] = subscribers.concat([action.subscriber]);
        subscriber2event[action.subscriber.guid] = targetEvent;
    }).subscribe(_.identity, util.makeErrorHandler('Subscribe API hook'));

    apiActions.filter(function (action) {
        return action.event === '__unsubscribe__';
    }).do(function (action) {
        var guid = action.subscriber.guid;
        if (guid in subscriber2event) {
            var targetEvent = subscriber2event[guid];
            delete subscriber2event[guid];

            var subscribers = event2subscribers[targetEvent] || [];
            event2subscribers[targetEvent] = _.filter(subscribers, function (subscriber) {
                return subscriber.guid !== guid;
            });

            // Triggers onComplete on the API side.
            postEvent(apiEvents, action.subscriber, {
                event: '__unsubscribe__'
            });
        } else {
            console.error('Tyring to unsubscribe unknown subscription!');
        }
    }).subscribe(_.identity, util.makeErrorHandler('Unsubscribe API hook'));

    doneLoading.do(function () {
        postEvent(apiEvents, undefined, {event: 'loaded'});
    }).subscribe(_.identity, util.makeErrorHandler('API hook for doneLoading'));

    appState.latestHighlightedObject.flatMapLatest(function (slice) {
        return encodeEntities(socket, slice);
    }).do(function (ids) {
        _.each(event2subscribers.highlighted, function (subscriber) {
            postEvent(apiEvents, subscriber, {event: 'highlighted', items: ids});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for latestHighlightedObject'));

    appState.activeSelection.flatMapLatest(function (slice) {
        return encodeEntities(socket, slice);
    }).do(function (ids) {
        _.each(event2subscribers.selected, function (subscriber) {
            postEvent(apiEvents, subscriber, {event: 'selected', items: ids});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for activeSelection'));

    appState.settingsChanges.do(function (setting) {
        _.each(event2subscribers.settingChanged, function (subscriber) {
            postEvent(apiEvents, subscriber, {
                event: 'settingChanged',
                setting: setting.name,
                value: setting.value
            });
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for settingsChanges'));

    appState.simulateOn.do(function (bool) {
        _.each(event2subscribers.simulating, function (subscriber) {
            postEvent(apiEvents, subscriber, {event: 'simulating', value: bool});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for simulateOn'));

    var sceneChanges = appState.cameraChanges.combineLatest(appState.vboUpdates, _.identity);

    sceneChanges.do(function () {
        _.each(event2subscribers['node.move'], function (subscriber) {
            nodeMove(appState, subscriber);
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for sceneChanges'));

    appState.clickEvents.do(function (e){
        var clickedNodes = _.pluck(_.where(e.clickPoints, {dim: 1}), 'idx');
        _.chain(event2subscribers['node.click']).filter(function (subscriber) {
            return _.contains(clickedNodes, subscriber.node.viewIdx);
        }).each(function (subscriber) {
            nodeClick(appState.apiEvents, subscriber, e);
        });
    }).flatMapLatest(function (e) {
        return encodeEntities(socket, e.clickPoints);
    }).do(function (sel) {
        _.each(event2subscribers.clicked, function (subscriber) {
            postEvent(apiEvents, subscriber, {event: 'clicked', items: sel});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for clickEvents'));

    postEvent(apiEvents, undefined, {event: 'apiReady'});
}


function postEvent(apiEvents, subscriber, body) {
    apiEvents.onNext({
        subscriberID: subscriber !== undefined ? subscriber.guid : '*',
        body: body
    });
}


function getPointPosition(appState, indices) {
    var renderState = appState.renderState;
    var curPoints = renderState.get('hostBuffers').curPoints;

    return curPoints.take(1).map(function (curPoints) {
        var camera = renderState.get('camera');
        var cnv = renderState.get('canvas');

        var points = new Float32Array(curPoints.buffer);
        return _.map(indices, function (idx) {
            return camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv);
        });
    });
}

function nodeMove(appState, subscriber) {
    getPointPosition(appState, [subscriber.node.viewIdx]).do(function (posList) {
        postEvent(appState.apiEvents, subscriber, {
            event: 'node.move',
            node: subscriber.node,
            pos: posList[0]
        });
    }).subscribe(_.identity, util.makeErrorHandler('nodeMove'));
}


function nodeClick(apiEvents, subscriber, event) {
    postEvent(apiEvents, subscriber, {
        event: 'node.click',
        node: subscriber.node,
        ctrl: event.ctrl
    });
}


module.exports = {
    setupAPIHooks: setupAPIHooks,
    postEvent: postEvent
};

'use strict';

var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util            = require('./util.js');



function encodeEntities(socket, sel) {
    return Rx.Observable.fromCallback(socket.emit, socket)('get_global_ids', sel)
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

    appState.latestHighlightedObject.flatMapLatest(function (sel) {
        return encodeEntities(socket, sel);
    }).do(function (ids) {
        _.each(event2subscribers.highlighted, function (subscriber) {
            postEvent(apiEvents, subscriber, {event: 'highlighted', items: ids});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for latestHighlightedObject'));

    appState.activeSelection.flatMapLatest(function (sel) {
        return encodeEntities(socket, sel);
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

    postEvent(apiEvents, undefined, {event: 'apiReady'});
}


function postEvent(apiEvents, subscriber, body) {
    apiEvents.onNext({
        subscriberID: subscriber !== undefined ? subscriber.guid : '*',
        body: body
    });
}


function nodeMove(appState, subscriber) {
    var renderState = appState.renderState;
    var curPoints = renderState.get('hostBuffers').curPoints;

    curPoints.take(1).map(function (curPoints) {
        var camera = renderState.get('camera');
        var cnv = renderState.get('canvas');

        var points = new Float32Array(curPoints.buffer);
        var idx = subscriber.node.viewIdx;

        return camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv);
    }).do(function (pos) {
        postEvent(appState.apiEvents, subscriber, {
            event: 'node.move',
            node: subscriber.node,
            pos: pos
        });
    }).subscribe(_.identity, util.makeErrorHandler('nodeMove'));
}


module.exports = {
    setupAPIHooks: setupAPIHooks,
    postEvent: postEvent
};

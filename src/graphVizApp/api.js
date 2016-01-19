'use strict';

var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util            = require('./util.js');


/**
 * @param {Socket} socket
 * @param {VizSlice} slice
 * @returns {Rx.Observable}
 */
function encodeEntities(socket, slice) {
    return Rx.Observable.bindCallback(socket.emit.bind(socket))('get_global_ids', slice.getVizSliceElements())
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
    var apiRequests = new Rx.Subject();

    var event2subscribers = {};
    var subscriber2event = {};

    apiActions.filter(function (action) {
        return action.event === '__subscribe__';
    }).do(function (action) {
        var targetEvent = action.subscriber.target;
        var subscribers = event2subscribers[targetEvent] || [];
        event2subscribers[targetEvent] = subscribers.concat([action.subscriber]);
        subscriber2event[action.subscriber._guid] = targetEvent;
        if (action.subscriber._isReq) {
            apiRequests.onNext(action.subscriber);
        }
    }).subscribe(_.identity, util.makeErrorHandler('Subscribe API hook'));

    apiActions.filter(function (action) {
        return action.event === '__unsubscribe__';
    }).do(function (action) {
        var guid = action.subscriber._guid;
        if (guid in subscriber2event) {
            var targetEvent = subscriber2event[guid];
            delete subscriber2event[guid];

            var subscribers = event2subscribers[targetEvent] || [];
            event2subscribers[targetEvent] = _.filter(subscribers, function (subscriber) {
                return subscriber._guid !== guid;
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

    appState.latestHighlightedObject.switchMap(function (slice) {
        return encodeEntities(socket, slice);
    }).do(function (ids) {
        _.each(event2subscribers.highlighted, function (subscriber) {
            postEvent(apiEvents, subscriber, {event: 'highlighted', items: ids});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for latestHighlightedObject'));

    appState.activeSelection.switchMap(function (slice) {
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
        var slice = e.clickSlice;
        _.chain(event2subscribers['node.click']).filter(function (subscriber) {
            return slice.containsIndexByDim(subscriber.node.viewIdx, 1);
        }).each(function (subscriber) {
            nodeClick(appState, subscriber, e);
        });
    }).switchMap(function (e) {
        return encodeEntities(socket, e.clickSlice);
    }).do(function (sel) {
        _.each(event2subscribers.clicked, function (subscriber) {
            postEvent(apiEvents, subscriber, {event: 'clicked', items: sel});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for clickEvents'));


    var reqHandlers = {
        'node.getScreenPosition': nodePosition.bind('', appState),
        'node.getLabel': nodeLabel.bind('', appState)
    };

    apiRequests.do(function (subscriber) {
        var reqName = subscriber.target;
        if (reqName in reqHandlers) {
            reqHandlers[reqName](subscriber);
        } else {
            console.error('Unknown request', reqName);
        }
    }).subscribe(_.identity, util.makeErrorHandler('API hook for requests'));

    postEvent(apiEvents, undefined, {event: 'apiReady'});
}


function postEvent(apiEvents, subscriber, body) {
    apiEvents.onNext({
        subscriberID: subscriber !== undefined ? subscriber._guid : '*',
        body: body
    });
}


function getPointPosition(appState, indices) {
    var curPoints = appState.renderState.get('hostBuffers').curPoints;

    return curPoints.take(1).map(function (curPoints) {
        return curPoints2Position(curPoints, appState.renderState, indices);
    });
}


function curPoints2Position(curPoints, renderState, indices) {
    var camera = renderState.get('camera');
    var cnv = renderState.get('canvas');
    var points = new Float32Array(curPoints.buffer);

    return _.map(indices, function (idx) {
        return camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv);
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


function nodeClick(appState, subscriber, event) {
    getPointPosition(appState, [subscriber.node.viewIdx]).do(function (posList) {
        postEvent(appState.apiEvents, subscriber, {
            event: 'node.click',
            node: subscriber.node,
            ctrl: event.ctrl,
            pos: posList[0]
        });
    });
}


function nodePosition(appState, subscriber) {
    getPointPosition(appState, [subscriber.node.viewIdx]).do(function (posList) {
        postEvent(appState.apiEvents, subscriber, {
            event: 'node.getScreenPosition',
            node: subscriber.node,
            pos: posList[0]
        });
    }).subscribe(_.identity, util.makeErrorHandler('nodePosition'));
}


function nodeLabel(appState, subscriber) {
    appState.poi.getLabelObject({dim: 1, idx: subscriber.node.viewIdx}).do(function (label) {
        console.log('LABEL',label);
        postEvent(appState.apiEvents, subscriber, {
            event: 'node.getLabel',
            node: subscriber.node,
            label: label
        });
    }).subscribe(_.identity, util.makeErrorHandler('nodeLabel'));
}

module.exports = {
    setupAPIHooks: setupAPIHooks,
    postEvent: postEvent
};

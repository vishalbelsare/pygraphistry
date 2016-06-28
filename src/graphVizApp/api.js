'use strict';

var Rx      = require('rxjs/Rx');
              require('../rx-jquery-stub');
const _       = require('underscore');

const util    = require('./util.js');
const Command = require('./command.js');


/**
 * @param {Socket} socket
 * @param {VizSlice} slice
 * @returns {Rx.Observable}
 */
function encodeEntities (socket, slice) {
    const getGlobalIDsCommand = new Command('Transforming IDs to global index', 'get_global_ids', socket, false);
    return getGlobalIDsCommand.sendWithObservableResult(slice.getVizSliceElements()).map((reply) => reply.ids);
}


function setupAPIHooks (socket, appState, doneLoading) {
    const apiEvents = appState.apiEvents;
    const apiActions = appState.apiActions;
    const apiRequests = new Rx.Subject();

    const event2subscribers = {};
    const subscriber2event = {};

    apiActions.filter((action) => action.event === '__subscribe__'
    ).do((action) => {
        const targetEvent = action.subscriber.target;
        const subscribers = event2subscribers[targetEvent] || [];
        event2subscribers[targetEvent] = subscribers.concat([action.subscriber]);
        subscriber2event[action.subscriber._guid] = targetEvent;
        if (action.subscriber._isReq) {
            apiRequests.onNext(action.subscriber);
        }
    }).subscribe(_.identity, util.makeErrorHandler('Subscribe API hook'));

    apiActions.filter((action) => action.event === '__unsubscribe__'
    ).do((action) => {
        const guid = action.subscriber._guid;
        if (guid in subscriber2event) {
            const targetEvent = subscriber2event[guid];
            delete subscriber2event[guid];

            const subscribers = event2subscribers[targetEvent] || [];
            event2subscribers[targetEvent] = _.filter(subscribers, (subscriber) => subscriber._guid !== guid);

            // Triggers onComplete on the API side.
            postEvent(apiEvents, action.subscriber, {
                event: '__unsubscribe__'
            });
        } else {
            console.error('Tyring to unsubscribe unknown subscription!');
        }
    }).subscribe(_.identity, util.makeErrorHandler('Unsubscribe API hook'));

    doneLoading.do(() => {
        postEvent(apiEvents, undefined, {event: 'loaded'});
    }).subscribe(_.identity, util.makeErrorHandler('API hook for doneLoading'));

    appState.latestHighlightedObject.switchMap((slice) => encodeEntities(socket, slice)
    ).do((ids) => {
        _.each(event2subscribers.highlighted, (subscriber) => {
            postEvent(apiEvents, subscriber, {event: 'highlighted', items: ids});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for latestHighlightedObject'));

    appState.activeSelection.switchMap((slice) => encodeEntities(socket, slice)
    ).do((ids) => {
        _.each(event2subscribers.selected, (subscriber) => {
            postEvent(apiEvents, subscriber, {event: 'selected', items: ids});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for activeSelection'));

    appState.settingsChanges.do((setting) => {
        _.each(event2subscribers.settingChanged, (subscriber) => {
            postEvent(apiEvents, subscriber, {
                event: 'settingChanged',
                setting: setting.name,
                value: setting.value
            });
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for settingsChanges'));

    appState.simulateOn.do((bool) => {
        _.each(event2subscribers.simulating, (subscriber) => {
            postEvent(apiEvents, subscriber, {event: 'simulating', value: bool});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for simulateOn'));

    const sceneChanges = appState.cameraChanges.combineLatest(appState.vboUpdates, _.identity);

    sceneChanges.do(() => {
        _.each(event2subscribers['node.move'], (subscriber) => {
            nodeMove(appState, subscriber);
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for sceneChanges'));

    appState.clickEvents.do((e) => {
        const slice = e.clickSlice;
        _.chain(event2subscribers['node.click']).filter(
            (subscriber) => slice.containsIndexByDim(subscriber.node.viewIdx, 1)
        ).each((subscriber) => {
            nodeClick(appState, subscriber, e);
        });
    }).switchMap((e) => encodeEntities(socket, e.clickSlice)
    ).do((sel) => {
        _.each(event2subscribers.clicked, (subscriber) => {
            postEvent(apiEvents, subscriber, {event: 'clicked', items: sel});
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for clickEvents'));


    const reqHandlers = {
        'node.getScreenPosition': nodePosition.bind('', appState),
        'node.getLabel': nodeLabel.bind('', appState)
    };

    apiRequests.do((subscriber) => {
        const reqName = subscriber.target;
        if (reqName in reqHandlers) {
            reqHandlers[reqName](subscriber);
        } else {
            console.error('Unknown request', reqName);
        }
    }).subscribe(_.identity, util.makeErrorHandler('API hook for requests'));

    postEvent(apiEvents, undefined, {event: 'apiReady'});
}


function postEvent (apiEvents, subscriber, body) {
    apiEvents.onNext({
        subscriberID: subscriber !== undefined ? subscriber._guid : '*',
        body: body
    });
}


function getPointPosition (appState, indices) {
    const curPoints = appState.renderState.get('hostBuffers').curPoints;

    return curPoints.take(1).map((theCurPoints) => curPoints2Position(theCurPoints, appState.renderState, indices));
}


function curPoints2Position (curPoints, renderState, indices) {
    const camera = renderState.get('camera');
    const cnv = renderState.get('canvas');
    const points = new Float32Array(curPoints.buffer);

    return _.map(indices, (idx) => camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv));
}


function nodeMove (appState, subscriber) {
    getPointPosition(appState, [subscriber.node.viewIdx]).do((posList) => {
        postEvent(appState.apiEvents, subscriber, {
            event: 'node.move',
            node: subscriber.node,
            pos: posList[0]
        });
    }).subscribe(_.identity, util.makeErrorHandler('nodeMove'));
}


function nodeClick (appState, subscriber, event) {
    getPointPosition(appState, [subscriber.node.viewIdx]).do((posList) => {
        postEvent(appState.apiEvents, subscriber, {
            event: 'node.click',
            node: subscriber.node,
            ctrl: event.ctrl,
            pos: posList[0]
        });
    });
}


function nodePosition (appState, subscriber) {
    getPointPosition(appState, [subscriber.node.viewIdx]).do((posList) => {
        postEvent(appState.apiEvents, subscriber, {
            event: 'node.getScreenPosition',
            node: subscriber.node,
            pos: posList[0]
        });
    }).subscribe(_.identity, util.makeErrorHandler('nodePosition'));
}


function nodeLabel (appState, subscriber) {
    appState.poi.getLabelObject({dim: 1, idx: subscriber.node.viewIdx}).do((label) => {
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

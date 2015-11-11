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

    doneLoading.do(function () {
        apiEvents.onNext({event: 'loaded'});
    }).subscribe(_.identity, util.makeErrorHandler('API hook for doneLoading'));

    appState.latestHighlightedObject.flatMapLatest(function (slice) {
        return encodeEntities(socket, slice);
    }).do(function (ids) {
        apiEvents.onNext({
            event: 'highlighted',
            ids: ids
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for latestHighlightedObject'));

    appState.activeSelection.flatMapLatest(function (slice) {
        return encodeEntities(socket, slice);
    }).do(function (ids) {
        apiEvents.onNext({
            event: 'selected',
            ids: ids
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for activeSelection'));

    appState.settingsChanges.do(function (setting) {
        apiEvents.onNext({
            event: 'settingChanged',
            setting: setting.name,
            value: setting.value
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for settingsChanges'));

    appState.simulateOn.do(function (bool) {
        apiEvents.onNext({
            event: 'simulating',
            value: bool
        });
    }).subscribe(_.identity, util.makeErrorHandler('API hook for simulateOn'));
}


module.exports = {
    setupAPIHooks: setupAPIHooks
};

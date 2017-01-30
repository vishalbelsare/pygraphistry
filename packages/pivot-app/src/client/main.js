// window['__trace_container_updates__'] = true;

import 'react-tag-input/example/reactTags.css';
import 'rc-switch/assets/index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-bootstrap-table/dist/react-bootstrap-table.min.css';
import 'react-select/dist/react-select.css';
import 'pivot-shared/pivots/components/TimeRangeWidget/variables.scss';
import 'pivot-shared/pivots/components/TimeRangeWidget/styles.scss';
import 'font-awesome/css/font-awesome.css';

import React from 'react';
import ReactDOM from 'react-dom';
import SocketIO from 'socket.io-client';
import { decode } from 'querystring';
import { Observable, Scheduler } from 'rxjs';
import { reloadHot } from '../shared/reloadHot';
import { Model } from '@graphistry/falcor-model-rxjs';
import { FalcorPubSubDataSource } from '@graphistry/falcor-socket-datasource';

import { Provider } from 'react-redux';
import { configureStore } from '../shared/store/configureStore';

import logger from '../shared/logger.js';
const log = logger.createLogger(__filename);

const useLocalStorage = __DEV__;
const localStorageToken = 'pivots-app-cache';


window.onerror = function(message, file, line, col, error) {
    log.error(error, message);
}

Observable
    .fromEvent(window, 'load', () => {
        printBuildInfo();
        return decode(window.location.search.substring(1));
    })
    .switchMap(() => reloadHot(module))
    .switchMap(initSocket, (options, socket) => ({
        ...options, socket
    }))
    .switchMap(({ App, socket }) => {
        const renderAsObservable = Observable.bindCallback(ReactDOM.render);
        return renderAsObservable((
            <Provider store={configureStore()}>
                <App falcor={getAppModel(socket)}/>
            </Provider>
        ), getAppDOMNode());
    })
    .subscribe({
        next() { /* Observable must be subscribed to in order to execute */ },
        error(e) {
            log.error(e);
            debugger; // eslint-disable-line no-debugger
        }
    });

function printBuildInfo() {
    const buildNum = __BUILDNUMBER__ === undefined ? 'Local build' : `Build #${__BUILDNUMBER__}`;
    const buildDate = (new Date(__BUILDDATE__)).toLocaleString();
    log.info(`[PivotApp] ${buildNum} of ${__GITBRANCH__}@${__GITCOMMIT__} (on ${buildDate})`);
}

function getAppDOMNode() {
    let appDomNode = document.getElementById('app');
    if (appDomNode) {
        return appDomNode
    }
    appDomNode = document.createElement('article');
    appDomNode.id = 'app';
    document.body.appendChild(appDomNode);
    return appDomNode;
}

function getAppModel(socket) {
    window.appModel = new Model({
        recycleJSON: true,
        cache: getAppCache(),
        scheduler: Scheduler.asap
    });
    window.appModel._source = new FalcorPubSubDataSource(socket, window.appModel);
    return window.appModel;
}

function getAppCache() {

    let appCache;

    if (window.appCache) {
        appCache = window.appCache;
        delete window.appCache;
    } else if (useLocalStorage && localStorage && localStorage.getItem) {
        const localStorageCache = localStorage.getItem(localStorageToken);
        if (localStorageCache) {
            try {
                appCache = JSON.parse(localStorageCache);
            } catch (e) {
                appCache = {};
            }
        }
    } else {
        appCache = {};
    }

    return appCache;
}

function initSocket() {

    const socket = SocketIO.Manager({
        path: `/pivot/socket.io`, reconnection: false,
        query: { userId: 0 } // <-- TODO: get the user ID from falcor
    }).socket('/');

    const socketConnected = Observable.fromEvent(socket, 'connect');
    const socketErrorConnecting = Observable.merge(
        Observable.fromEvent(socket, 'error'),
        Observable.fromEvent(socket, 'connect_error')
    )
    .mergeMap((e) => Observable.throw(e));

    return socketConnected
        .take(1).mapTo(socket)
        .merge(socketErrorConnecting);

}

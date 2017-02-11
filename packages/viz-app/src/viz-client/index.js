// if (__DEV__) {
//     window['__trace_container_updates__'] = true;
// }

import '@graphistry/rc-slider/assets/index.css';
import 'rc-switch/assets/index.css';
import 'rc-color-picker/assets/index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-select/dist/react-select.css';
import 'font-awesome/css/font-awesome.css';

import {
    Observable, Subscriber, Subscription,
    Subject, AsyncSubject, BehaviorSubject, ReplaySubject
} from 'rxjs';

import setObservableConfig from 'recompose/setObservableConfig';
import rxjsObservableConfig from 'recompose/rxjsObservableConfig';
setObservableConfig(rxjsObservableConfig);

Observable.return = function (value) {
    return Observable.of(value);
};

Subject.prototype.onNext = Subject.prototype.next;
Subject.prototype.onError = Subject.prototype.error;
Subject.prototype.onCompleted = Subject.prototype.complete;
Subject.prototype.dispose = Subscriber.prototype.unsubscribe;
AsyncSubject.prototype.onNext = AsyncSubject.prototype.next;
AsyncSubject.prototype.onCompleted = AsyncSubject.prototype.complete;
BehaviorSubject.prototype.onNext = BehaviorSubject.prototype.next;
ReplaySubject.prototype.onNext = ReplaySubject.prototype.next;

Subscriber.prototype.onNext = Subscriber.prototype.next;
Subscriber.prototype.onError = Subscriber.prototype.error;
Subscriber.prototype.onCompleted = Subscriber.prototype.complete;
Subscriber.prototype.dispose = Subscriber.prototype.unsubscribe;

Subscription.prototype.dispose = Subscription.prototype.unsubscribe;

import _debug from 'debug';
import ReactDOM from 'react-dom';
import { PropTypes } from 'react';
import { partial } from 'lodash';
import { Provider } from 'react-redux';
import { configureStore } from 'viz-shared/store/configureStore';
import * as reducers from './reducers';
let { default: rootReducer, ...epics } = reducers;
epics = Object.keys(epics).map((x) => epics[x]);

import { reloadHot } from 'viz-client/reloadHot';
import {
    setupTitle,
    setupAnalytics,
    getURLParameters,
    loadClientModule,
    setupErrorHandlers,
    setupDocumentElement } from './startup';
import { setupLegacyInterop } from './legacy';

const debug = _debug('graphistry:viz-client');

Observable
    .fromEvent(window, 'load', () => window.location.href)
    .map(partial(getURLParameters, debug))
    // Set the document title based on the URL params
    .map(partial(setupTitle, document))
    // Initialize Google analytics
    .map(partial(setupAnalytics, window))
    .multicast(() => new Subject(), (multicastedOptions) => Observable.merge(
        multicastedOptions,
        // Setup global error handlers, but ignore the values emitted.
        multicastedOptions
            .mergeMap(partial(setupErrorHandlers, document, window))
            .ignoreElements(),
    ))
    // Apply global classes to the document element.
    .do(partial(setupDocumentElement, document))
    .mergeMapTo(reloadHot(module), (options, { App }) => ({ options, App }))
    // Load the specific client module JS (main or static) via require.ensure
    .switchMap(
        ({ options, App }) => loadClientModule(options, debug),
        ({ options, App }, initialize) => ({ App, options, initialize })
    )
    .switchMap(
        ({ options, App, initialize }) => initialize(options, debug),
        ({ options, App }, options2) => ({
            App, options: { ...options, ...options2 }
        })
    )
    .map(partial(setupLegacyInterop, document))
    .switchMap(
        ({ App, options }) => {
            const { model, ...props } = options;
            const store = configureStore(getInitialState(), rootReducer, epics);
            const renderAsObservable = Observable.bindCallback(
                ReactDOM.render,
                () => [store.getState(), options]
            );
            return renderAsObservable((
                <Provider store={store}>
                    <App falcor={model} key='viz-client'/>
                </Provider>
            ), getRootDOMNode());
        }
    )
    .multicast(() => new Subject(), (shared) => Observable.merge(
        shared.skip(1),
        shared.take(1).do(initVizApp)
    ))
    .subscribe({
        next([ initialAppState, options ]) {
            // debugger;
        }
    });

function getRootDOMNode(appDomNode) {
    return appDomNode = (
        document.getElementById('root') ||
        document.body.appendChild((
            appDomNode = document.createElement('div')) && (
            appDomNode.id = 'root') && (
            appDomNode)
        )
    );
}

function getInitialState() {
    return window.__INITIAL_STATE__;
}

function initVizApp([ initialAppState, options ]) {
    window.appModel = options.model;
}

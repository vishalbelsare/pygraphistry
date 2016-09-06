import '@graphistry/rc-slider/assets/index.css';
import 'rc-switch/assets/index.css';
import 'rc-color-picker/assets/index.css';

import {
    Observable, Subscriber, Subscription,
    Subject, AsyncSubject, BehaviorSubject, ReplaySubject
} from 'rxjs';

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

import {
    compose,
    withContext,
    hoistStatics
} from 'recompose';

import $ from 'jquery';
import _debug from 'debug';
import ReactDOM from 'react-dom';
import { PropTypes } from 'react';
import { partial } from 'lodash';
import { Provider } from 'react-redux';
import { configureStore } from 'viz-shared/store/configureStore';

import { reloadHot } from 'viz-client/reloadHot';
import { setupTitle, setupAnalytics,
         getURLParameters, loadClientModule,
         setupErrorHandlers, setupDocumentElement,
         setupSplashOrContinue } from './startup';

const debug = _debug('graphistry:viz-client');

Observable
    .fromEvent(window, 'load', () => window.location.search.substring(1))
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
    // Show the splash screen and continue when the user clicks through, or
    // continue immediately if we're not supposed to show the splash screen.
    .mergeMap(partial(setupSplashOrContinue, document))
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
    .map(({ App, options }) => ({
        options,
        App: hoistStatics(withContext(
            { play: PropTypes.number,
              socket: PropTypes.object,
              pixelRatio: PropTypes.number,
              handleVboUpdates: PropTypes.func }, () => (
            { play: options.play,
              socket: options.socket,
              pixelRatio: options.pixelRatio,
              handleVboUpdates: options.handleVboUpdates }
        )))(App)
    }))
    .switchMap(
        ({ App, options }) => {
            const { model, ...props } = options;
            const store = configureStore(getInitialState());
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
        next([ options, state ]) {
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
    return window.__INITIAL_STATE__ || {};
}

function initVizApp([ initialAppState, options ]) {
    window.appModel = options.model;
}

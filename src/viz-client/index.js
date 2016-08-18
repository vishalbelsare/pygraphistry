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

import $ from 'jquery';
import _debug from 'debug';
import ReactDOM from 'react-dom';
import { partial } from 'lodash';
import { Provider } from 'reaxtor-redux';
import { configureStore } from '../viz-shared/store/configureStore';
import { init as initRenderer } from './streamGL/renderer';
import vizApp from './streamGL/graphVizApp/vizApp';
import { reloadHot } from '../viz-shared/reloadHot';
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
    .switchMap(
        ({ App, options }) => {
            const { model, ...props } = options;
            const store = configureStore({});
            const renderAsObservable = Observable.bindCallback(
                ReactDOM.render,
                () => [store.getState(), options]
            );
            return renderAsObservable((
                <Provider store={store} falcor={model}>
                    <App key='viz-client'/>
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

function initVizApp([ initialAppState, options ]) {

    const uri = { href: '/graph/', pathname: '' };
    const canvas = $('#simulation')[0];
    const { model, socket, handleVboUpdates } = options;

    window.appModel = model;

    // const { workbooks: { open: { views: { current: { scene }}}}} = initialAppState;
    // const initialRenderState = initRenderer(scene, model.deref(scene.camera), canvas, options);
    // const { vboUpdates, vboVersions } = handleVboUpdates(socket, uri, initialRenderState);
    // const apiEvents = new Subject();
    // const apiActions = new Subject();

    // vizApp(socket, initialRenderState, vboUpdates, vboVersions,
    //        apiEvents, apiActions, uri, options, model, initialAppState);
}

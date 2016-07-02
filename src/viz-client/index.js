if (__DEV__) {
    require('source-map-support').install();
}

import Rx from '@graphistry/rxjs';

Rx.Observable.return = function (value) {
    return Rx.Observable.of(value);
};

Rx.Subject.prototype.onNext = Rx.Subject.prototype.next;
Rx.Subject.prototype.onError = Rx.Subject.prototype.error;
Rx.Subject.prototype.onCompleted = Rx.Subject.prototype.complete;
Rx.Subject.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;
Rx.AsyncSubject.prototype.onNext = Rx.AsyncSubject.prototype.next;
Rx.AsyncSubject.prototype.onCompleted = Rx.AsyncSubject.prototype.complete;
Rx.BehaviorSubject.prototype.onNext = Rx.BehaviorSubject.prototype.next;
Rx.ReplaySubject.prototype.onNext = Rx.ReplaySubject.prototype.next;

Rx.Subscriber.prototype.onNext = Rx.Subscriber.prototype.next;
Rx.Subscriber.prototype.onError = Rx.Subscriber.prototype.error;
Rx.Subscriber.prototype.onCompleted = Rx.Subscriber.prototype.complete;
Rx.Subscriber.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;

Rx.Subscription.prototype.dispose = Rx.Subscription.prototype.unsubscribe;

import { init } from 'snabbdom';
import snabbdomClass from 'snabbdom/modules/class';
import snabbdomProps from 'snabbdom/modules/props';
import snabbdomStyle from 'snabbdom/modules/style';
import snabbdomAttributes from 'snabbdom/modules/attributes';
import snabbdomEventlisteners from 'snabbdom/modules/eventlisteners';

import _debug from 'debug';
import { partial } from 'lodash';
import { reaxtor } from 'reaxtor';
import { init as initRenderer } from './streamGL/renderer';
import vizApp from './streamGL/graphVizApp/vizApp';
import { reloadHot } from '../viz-shared/reloadHot';
import { Observable, Scheduler, Subject } from '@graphistry/rxjs';
import { setupTitle, setupAnalytics,
         getURLParameters, loadClientModule,
         setupErrorHandlers, setupDocumentElement,
         setupSplashOrContinue } from './startup';

const patchDOM = init([
    snabbdomClass,
    snabbdomProps, snabbdomStyle,
    snabbdomAttributes, snabbdomEventlisteners
]);

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
            return Observable
                .from(reaxtor(App, model, props))
                .auditTime(0, Scheduler.animationFrame);
        },
        ({ App, options }, [model, [appState, appVDom]]) => ([appVDom, appState, options])
    )
    // Render vDom in a scan event when we receive a hot-module reload,
    // but ignore the elements (since snabbdom patches the DOM for us).
    .scan(scanDOMWithOptions, [ getAppDOMNode() ])
    .map(([ dom, state, options ]) => [state, options])
    .multicast(() => new Subject(), (shared) => Observable.merge(
        shared.skip(1),
        shared.take(1).do(initVizApp)
    ))
    .subscribe({
        next([ options, state ]) {
            // debugger;
        }
    });

function scanDOMWithOptions(curr, next) {
    const dRoot = curr[0];
    const vRoot = next[0];
    const state = next[1];
    const options = next[2];
    return [
        patchDOM(dRoot, vRoot), state, options
    ];
}

function getAppDOMNode(appDomNode) {
    return appDomNode = (
        document.getElementById('app') ||
        document.body.appendChild((
            appDomNode = document.createElement('div')) && (
            appDomNode.id = 'app') && (
            appDomNode)
        )
    );
}

function initVizApp([ initialAppState, options ]) {

    const uri = { href: '/graph/', pathname: '' };
    const canvas = $('#simulation')[0];
    const { model, socket, handleVboUpdates } = options;
    const { workbooks: { open: { views: { current: { scene }}}}} = initialAppState;
    const initialRenderState = initRenderer(scene, model.deref(scene.camera), canvas, options);
    const { vboUpdates, vboVersions } = handleVboUpdates(socket, uri, initialRenderState);
    const apiEvents = new Subject();
    const apiActions = new Subject();

    vizApp(socket, initialRenderState, vboUpdates, vboVersions,
           apiEvents, apiActions, uri, options, model, initialAppState);
}

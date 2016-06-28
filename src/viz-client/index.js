require('source-map-support').install();

import { init } from 'snabbdom';
import snabbdomClass from 'snabbdom/modules/class';
import snabbdomProps from 'snabbdom/modules/props';
import snabbdomStyle from 'snabbdom/modules/style';
import snabbdomAttributes from 'snabbdom/modules/attributes';
import snabbdomEventlisteners from 'snabbdom/modules/eventlisteners';

import _debug from 'debug';
import { partial } from 'lodash';
import { reaxtor } from 'reaxtor';
import { reloadHot } from '../viz-shared/reloadHot';
import { Observable, Subject } from '@graphistry/rxjs';
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
                .debounceTime(0)
                .take(1);
        },
        ({ App, options }, [model, appVDom]) => ([options, appVDom])
    )
    // Render vDom in a scan event when we receive a hot-module reload,
    // but ignore the elements (since snabbdom patches the DOM for us).
    .scan(scanDOMWithOptions, [ null, getAppDOMNode() ])
    .map(([ options ]) => options)
    .subscribe(
        ({ model }) => {
            debugger;
        },
        (error) => {
            // debugger;
            console.error(error);
        }
    );
    // .subscribe(({ apiEvents, apiActions,
    //               uri, json, model, socket, options,
    //               vboUpdates, vboVersions, initialRenderState }) => {
    // });

function scanDOMWithOptions(curr, next) {
    const dRoot = curr[1];
    const vRoot = next[1];
    const options = next[0];
    return [
        options, patchDOM(dRoot, vRoot)
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

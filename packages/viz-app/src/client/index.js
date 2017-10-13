if (process.env.NODE_ENV === 'development') {
    require('source-map-support');
}

import 'babel-polyfill';
import 'rc-slider/assets/index.css';
import 'rc-switch/assets/index.css';
import 'rc-color-picker/assets/index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-select/dist/react-select.css';
import 'font-awesome/css/font-awesome.css';
import 'viz-app/index.less';

require('./startup/setupRxAndRecompose');

import React from 'react';
import { Provider } from 'react-redux';
import { AppContainer } from 'react-hot-loader';
import { render, unmountComponentAtNode } from 'react-dom';

import { congfigureLive } from './live';
import { configureStore } from './store';
import { setupAnalytics } from './startup/setupAnalytics';
import { getURLParameters } from './startup/getURLParameters';
import { setupLegacyInterop } from './legacy/setupLegacyInterop';
import { setupErrorHandlers } from './startup/setupErrorHandlers';

const store = configureStore();

//options.client === 'main' ? congfigureLive(options) : congfigureStatic(options);
const { model, socket, ...options } = setupErrorHandlers(
    document,
    window,
    congfigureLive(setupAnalytics(window, getURLParameters(window.location.href)))
);

const withLegacyInterop = setupLegacyInterop(document, { ...options, socket });

// socket && socket.on('connect', renderApp);

function renderApp() {
    const App = withLegacyInterop(require('viz-app/containers/app').default); // eslint-disable-line global-require
    render(
        <AppContainer>
            <Provider store={store}>
                <App falcor={model} params={options} key="viz-client" />
            </Provider>
        </AppContainer>,
        getRootDOMNode()
    );
}

// Hot reload the client App container
if (module.hot) {
    const reRenderApp = () => {
        try {
            renderApp();
        } catch (error) {
            const RedBox = require('redbox-react').default;
            render(<RedBox error={error} />, getRootDOMNode());
        }
    };
    module.hot.accept('viz-app/containers/app', () => {
        // App = withLegacyInterop(require('viz-app/containers/app').default); // eslint-disable-line global-require
        setImmediate(() => {
            // Preventing the hot reloading error from react-router
            // unmountComponentAtNode(getRootDOMNode());
            reRenderApp();
        });
    });
}

renderApp();

function getInitialState() {
    return window.__INITIAL_STATE__;
}

function getRootDOMNode(appDomNode) {
    return (appDomNode =
        document.getElementById('root') ||
        document.body.appendChild(
            (appDomNode = document.createElement('div')) && (appDomNode.id = 'root') && appDomNode
        ));
}

if (process.env.NODE_ENV !== 'production') {
    // Enable the React debugger in the console after the first mount
    window.React = React;

    /**
     * This adds the Perf addons to the global window so you can debug
     * the performance from within your console
     */
    // eslint-disable-next-line global-require,import/newline-after-import
    window.Perf = require('react-addons-perf');
}

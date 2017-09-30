if (process.env.NODE_ENV === 'development') {
    require('source-map-support');
}

import 'react-tag-input/example/reactTags.css';
import 'rc-switch/assets/index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-bootstrap-table/dist/react-bootstrap-table.min.css';
import 'react-select/dist/react-select.css';
import 'react-dates/lib/css/_datepicker.css';
import 'react-bootstrap-timezone-picker/dist/react-bootstrap-timezone-picker.min.css';
import 'font-awesome/css/font-awesome.css';
import '@graphistry/client-api-react/assets/index.css';

import setObservableConfig from 'recompose/setObservableConfig';
import rxjsObservableConfig from 'recompose/rxjsObservableConfig';
setObservableConfig(rxjsObservableConfig);

import React from 'react';
import io from 'socket.io-client';
import { Provider } from 'react-redux';
import { AppContainer } from 'react-hot-loader';
import * as Scheduler from 'rxjs/scheduler/async';
import { render, unmountComponentAtNode } from 'react-dom';

import { createLogger } from 'pivot-shared/logger';
import { Model } from '@graphistry/falcor-model-rxjs';
import { configureStore } from 'pivot-shared/store/configureStore';
import { FalcorPubSubDataSource } from '@graphistry/falcor-socket-datasource';

const useLocalStorage = __DEV__;
const localStorageToken = 'pivot-app';
const log = createLogger(__filename);

const { store, socket, model } = configureClient();

function renderApp() {
    const App = require('pivot-shared/main').App; // eslint-disable-line global-require
    render(
        <AppContainer>
            <Provider store={store}>
                <App key='pivot-app' falcor={model}/>
            </Provider>
        </AppContainer>,
        getRootDOMNode(),
    );
};

// Hot reload the client App container
if (module.hot) {
    const reRenderApp = () => {
        try { renderApp(); }
        catch (error) {
            const RedBox = require('redbox-react').default;
            render(<RedBox error={error} />, getRootDOMNode());
        }
    };
    module.hot.accept('pivot-shared/main', () => {
        setImmediate(() => {
            // Preventing the hot reloading error from react-router
            // unmountComponentAtNode(getRootDOMNode());
            reRenderApp();
        });
    });
}

renderApp();

if (process.env.NODE_ENV !== 'production') {

    // Enable the React debugger in the console after the first mount
    window.React = React;

    /**
     * This adds the Perf addons to the global window so you can debug
     * the performance from within your console
     */
    // eslint-disable-next-line global-require,import/newline-after-import
    // window.Perf = require('react-addons-perf');
}

function getRootDOMNode(appDomNode) {
    return appDomNode = (
        document.getElementById('app') ||
        document.body.appendChild((
            appDomNode = document.createElement('article')) && (
            appDomNode.id = 'app') && (
            appDomNode)
        )
    );
}

function configureClient() {

    const buildNum = __BUILDNUMBER__ === undefined ? 'Local build' : `Build #${__BUILDNUMBER__}`;
    const buildDate = (new Date(__BUILDDATE__)).toLocaleString();
    log.info(`[PivotApp] ${buildNum} of ${__GITBRANCH__}@${__GITCOMMIT__} (on ${buildDate})`);

    const store = configureStore();
    const socket = initAppSocket();
    const model = getAppModel(socket);

    const tmp_vars_script = document.getElementById('tmp_vars');
    if (tmp_vars_script && tmp_vars_script.parentNode) {
        tmp_vars_script.parentNode.removeChild(tmp_vars_script);
    }

    return { store, socket, model };

    function initAppSocket() {

        const socket = io.Manager({
            reconnection: false,
            perMessageDeflate: false,
            path: `${window.pivotMountPoint}/socket.io`,
            query: { userId: 0 } // <-- TODO: get the user ID from falcor
        }).socket('/');

        const socketIoEmit = socket.emit;
        socket.emit = function emitWithoutCompression() {
            return socketIoEmit.apply(this.compress(false), arguments);
        };

        return socket;
    }

    function getAppModel(socket) {
        window.appModel = new Model({
            recycleJSON: true,
            cache: getAppCache(),
            scheduler: Scheduler.asap,
            allowFromWhenceYouCame: true,
        });
        window.appModel._source = new FalcorPubSubDataSource(socket, window.appModel);
        return window.appModel;
    }

    function getAppCache() {

        let appCache;

        if (window.appCache) {
            appCache = window.appCache;
            delete window.appCache;
        } else {
            appCache = {};
        }

        return appCache;
    }
}

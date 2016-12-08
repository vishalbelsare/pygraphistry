import 'rc-switch/assets/index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-bootstrap-table/dist/react-bootstrap-table.min.css';
import 'react-select/dist/react-select.css';
import '../misc/react-dates.css';
import 'font-awesome/css/font-awesome.css';

import ReactDOM from 'react-dom';
import { decode } from 'querystring';
import { Model } from '@graphistry/falcor';
import { Observable, Scheduler } from 'rxjs';
import { reloadHot } from '../shared/reloadHot';
import DataSource from 'falcor-http-datasource';

import { Provider } from 'react-redux';
import { configureStore } from '../shared/store/configureStore';

import logger from '../shared/logger.js';
const log = logger.createLogger('pivot-app', __filename);

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
    .switchMap((params) => reloadHot(module))
    .switchMap(({ App }) => {
        const renderAsObservable = Observable.bindCallback(ReactDOM.render);
        return renderAsObservable((
            <Provider store={configureStore()}>
                <App falcor={getAppModel()}/>
            </Provider>
        ), getAppDOMNode());
    })
    .subscribe({
        next() {},
        error(e) {
            log.error(e);
            debugger;
        }
    });

function printBuildInfo() {
    const buildNum = __BUILDNUMBER__ === undefined ? 'Local build' : `Build #${__BUILDNUMBER__}`;
    const buildDate = (new Date(__BUILDDATE__)).toLocaleString();
    log.info(`${buildNum} of ${__GITBRANCH__}@${__GITCOMMIT__} (on ${buildDate})`)
}

function getAppDOMNode(appDomNode) {
    return appDomNode = (
        document.getElementById('app') ||
        document.body.appendChild((
            appDomNode = document.createElement('article')) && (
            appDomNode.id = 'app') && (
            appDomNode)
        )
    );
}

function getAppModel() {
    return window.appModel = new Model({
        cache: getAppCache(),
        recycleJSON: true,
        scheduler: Scheduler.asap,
        source: new DataSource('/model.json', { timeout: 20000 } ),
        treatErrorsAsValues: true
    });
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

import 'rc-switch/assets/index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-bootstrap-table/dist/react-bootstrap-table.min.css';

import ReactDOM from 'react-dom';
import { decode } from 'querystring';
import { Model } from '@graphistry/falcor';
import { Observable, Scheduler } from 'rxjs';
import { reloadHot } from '../shared/reloadHot';
import DataSource from 'falcor-http-datasource';

import { Provider } from 'react-redux';
import { configureStore } from '../shared/store/configureStore';

const useLocalStorage = __DEV__;
const localStorageToken = 'pivots-app-cache';

Observable
    .fromEvent(window, 'load', () => decode(window.location.search.substring(1)))
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
            debugger;
            console.error(e);
        }
    });

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
        JSONWithHashCodes: true,
        scheduler: Scheduler.asap,
        source: new DataSource('/model.json'),
        treatErrorsAsValues: true,
        // onChangesCompleted: function () {
        //     useLocalStorage &&
        //     localStorage && localStorage.setItem && localStorage.setItem(
        //         localStorageToken, JSON.stringify(this.getCache())
        //     );
        // }
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

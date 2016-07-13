import { decode } from 'querystring';
import { Model, reaxtor } from 'reaxtor';
import { Observable, Scheduler } from 'rxjs';
import { reloadHot } from '../shared/reloadHot';
import DataSource from 'falcor-http-datasource';
import { render as renderVDom } from './render';

const useLocalStorage = __DEV__;
const localStorageToken = 'pivots-app-cache';

Observable
    .fromEvent(window, 'load', () => decode(window.location.search.substring(1)))
    .switchMap(
        (params) => reloadHot(module),
        (params, { App }) => reaxtor(
            App, getAppModel(), params
        )
    )
    .switch()
    .auditTime(0, Scheduler.animationFrame)
    .scan(renderVDom, getAppDOMNode())
    .subscribe();

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
        scheduler: Scheduler.asap,
        source: new DataSource('/model.json'),
        onChangesCompleted: function () {
            useLocalStorage &&
            localStorage && localStorage.setItem && localStorage.setItem(
                localStorageToken, JSON.stringify(this.getCache())
            );
        }
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

    console.log(appCache);

    return appCache;
}

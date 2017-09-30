import { inspect } from 'util';
import { Observable } from 'rxjs';
import { App } from 'pivot-shared/main';
import stringify from 'json-stable-stringify';
import { Model } from '@graphistry/falcor-model-rxjs';

import createLogger from 'pivot-shared/logger';
const log = createLogger(__filename);

import RedBox from 'redbox-react';
import { renderToString } from 'react-dom/server';

export function configureRenderMiddleware(convict, getServerFalcorModel) {

    let AppContainer = App;

    // Hot reload the server AppContainer
    if (module.hot) {
        module.hot.accept('pivot-shared/main', () => {
            AppContainer = require('pivot-shared/main').App; // eslint-disable-line global-require
        });
    }

    return function renderMiddleware(req, res) {

        const model = getServerFalcorModel(req);
        const clientAssets = (res.locals &&
                              res.locals.webpackStats &&
                              res.locals.webpackStats.toJson() ||
                              require('./client-stats.json')).assetsByChunkName

        // Wrap in Observable.defer in case `template` or `AppContainer.load` throws an error
        return Observable.defer(() => {
            // If __DISABLE_SSR__ = true, disable server side rendering
            if (__DISABLE_SSR__) {
                return Observable.of({
                    status: 200, payload: template()
                });
            }
            return AppContainer.load({ falcor: model }).map(() => ({
                status: 200, payload: template({
                    clientAssets,
                    initialState: model.getCache(),
                    mountPoint: convict.get('pivotApp.mountPoint'),
                    // reactRoot: renderToString(
                    //     <AppContainer falcor={model} params={req.query} store={{
                    //         dispatch() {},
                    //         subscribe() { return () => {}; },
                    //         getState() { return ((model || {})._seed || {}).json || {}; },
                    //     }}/>
                    // )
                })
            }));
        })
        .catch((err) => {
            log.error({ err }, `error rendering graph.html`);
            // If not in local dev mode, re-throw the error so we can 502 the request.
            if (convict.get('env') !== 'development') {
                return Observable.throw(err);
            }
            // If in local dev mode, render an error page
            return Observable.of({
                status: 500, payload: renderToString(<RedBox error={err}/>)
            });
        })
        .subscribe(({ status, payload }) => {
            if(convict.get('env') === 'development') {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
            res.status(status).send(payload);
        });
    }
}

export default configureRenderMiddleware;

function assetsFromStats(stats = [], mountPoint) {
    return stats.reduce((assets, asset) => {
        if (asset.endsWith('.js')) {
            assets.js = `${mountPoint}/${asset}`;
        } else if (asset.endsWith('.css')) {
            assets.css = `${mountPoint}/${asset}`;
        }
        return assets;
    }, {});
}

function template({
    mountPoint = '', reactRoot = '',
    initialState = {}, clientAssets = {},
} = {}) {

    let { client, vendor, manifest } = clientAssets;
    const { html: iconsHTML } = require('./favicon-assets.json');

    client = assetsFromStats(client, mountPoint);
    vendor = assetsFromStats(vendor, mountPoint);
    manifest = assetsFromStats(manifest, mountPoint);

    return (`
<!DOCTYPE html>
<html lang='en-us'>
    <head>
        <meta charset="utf-8" />
        <meta name="robots" content="noindex, nofollow"/>
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
        <title>Graphistry Visual Playbook Environment</title>

        <meta content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0' name='viewport' />
        ${
        iconsHTML
            // strip out 'public/' because favicons webpack plugin
            // doesn't have an option to set a publicPath
            .map((str) => str.replace(/public\//, `${mountPoint}/`))
            .join('\n')
        }
        ${vendor && vendor.css ?`
        <link rel='stylesheet' type='text/css' href='${vendor.css}'/>`: ''}
        ${client && client.css ?`
        <link rel='stylesheet' type='text/css' href='${client.css}'/>`: ''}
    </head>
    <body>
        <div id='app'>${reactRoot}</div>
        <script type='text/javascript' id='tmp_vars'>
            window.pivotMountPoint = '${mountPoint}' || '/';
            window.appCache = ${stringify(initialState)} || {};
        </script>
        ${manifest && manifest.js ? `
        <script type="text/javascript" src="${manifest.js}"></script>` : ''}
        ${vendor && vendor.js ? `
        <script type="text/javascript" src="${vendor.js}"></script>` : ''}
        ${client && client.js ? `
        <script type="text/javascript" src="${client.js}"></script>` : ''}
    </body>
</html>`
    );
}

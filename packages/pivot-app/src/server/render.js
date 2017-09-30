import { Observable } from 'rxjs';
import { App } from 'pivot-shared/main';
import stringify from 'json-stable-stringify';

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
        const mountPoint = convict.get('pivotApp.mountPoint');
        const clientAssets = devClientAssets(mountPoint, res) || require('./client-assets.json');

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
                    clientAssets, mountPoint,
                    initialState: model.getCache()
                })
            }));
        })
        .catch((err) => {
            log.error({ err }, `error rendering ${req.originalUrl}`);
            if (convict.get('env') === 'development') {
                // If in local dev mode, render an error page
                return Observable.of({
                    status: 500, payload: renderToString(<RedBox error={err}/>)
                });
            }
            // If not in local dev mode, re-throw the error so we can 502 the request.
            return Observable.throw(err);
        });
    }
}

export default configureRenderMiddleware;

function devClientAssets(mountPoint, res) {
    let assets;
    return res.locals &&
           res.locals.webpackStats && (assets =
           res.locals.webpackStats.toJson().assetsByChunkName) && {
               client: assetsFromStats(assets.client, mountPoint),
               vendor: assetsFromStats(assets.vendor, mountPoint),
               manifest: assetsFromStats(assets.manifest, mountPoint),
           } || undefined;
}

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

    const { client, vendor, manifest } = clientAssets;
    const { html: iconsHTML } = require('./favicon-assets.json');

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

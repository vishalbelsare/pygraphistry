import React from 'react';
import { inspect } from 'util';
import { Observable } from 'rxjs';
import { renderToString as reactRenderToString } from 'react-dom/server';
import fetchDataUntilSettled from '@graphistry/falcor-react-redux/lib/utils/fetchDataUntilSettled';
import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);

import webpackAssets from '../webpack-assets.json';
let faviconStats = { html:[] };
try {
    faviconStats = require('./favicon-assets.json');
}
catch (e) {
    log.debug('Skipping favicons');
}


// const renderServerSide = false;
const renderServerSide = true;

export function renderMiddleware(getFaclorModel, modules) {
    return function renderMiddleware(req, res) {
        try {
            const falcorModel = getFaclorModel(req);
            const renderedResults =
                !renderServerSide ? Observable.of(renderFullPage())
                                  : renderAppWithHotReloading(modules, falcorModel);

            renderedResults.take(1).subscribe({
                next(html) {
                    res.type('html').send(html);
                },
                error(e, error = e && e.stack || inspect(e, { depth: null })) {
                    log.error({
                        err: e,
                        boundPath: JSON.stringify(e.boundPath),
                        shortedPath: JSON.stringify(e.shortedPath)
                    });

                    res.status(500).send(reactRenderToString(<pre>{error}</pre>));
                }
            });
        } catch (e) {
            const error = e && e.stack || inspect(e, { depth: null });
            log.error(e);
            res.status(500).send(reactRenderToString(<pre>{error}</pre>));
        }
    }
}


function renderAppWithHotReloading(modules, model) {
    return modules
        .map(({ App }) => ({
            App,
            model
        }))
        .switchMap(
            ({ App, model }) => fetchDataUntilSettled({
                    data: {},
                    falcor: model,
                    fragment: App.fragment
                })
                .takeLast(1),
            ({ App, model }, { data }) => ({ App, model, data })
        )
        .map(({ model }) => renderFullPage(model));
}


function renderFullPage(model, html = '') {
    const { client, vendor } = webpackAssets;
    const { html: iconsHTML } = faviconStats;

    return (
    `<!DOCTYPE html>
    <html lang='en-us'>
        <head>
            <meta charset="utf-8" />
            <meta name="robots" content="noindex, nofollow"/>
            <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <base href="http://localhost:3000" />
            <title>Graphistry Visual Playbook Environment</title>

            <meta content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0' name='viewport' />
            ${ iconsHTML.length === 0 ? iconsHTML.join('\n')
                                      : <link rel="shortcut icon" href="not_found/favicon.ico" />
            }

            <link rel='stylesheet' type='text/css' href='${client.css || ''}'/>
        </head>
        <body>
            <div id='app'>${html}</div>
            <script type='text/javascript'>
                window.appCache = ${JSON.stringify(model && model.getCache() || {})};
            </script>
            <script src='${vendor.js}'></script>
            <script src='${client.js}'></script>
        </body>
    </html>`
    );
}

import { createLogger } from '@graphistry/common/logger';
const logger = createLogger('viz-app:viz-worker:renderer');

import url from 'url';
import { inspect } from 'util';
import stringify from 'json-stable-stringify';
import faviconStats from './favicon-assets.json';
import webpackAssets from './webpack-assets.json';

import { Provider } from 'react-redux';
import { Observable } from 'rxjs/Observable'
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { renderToString as reactRenderToString } from 'react-dom/server';

import { Model } from '@graphistry/falcor';
import fetchDataUntilSettled from '@graphistry/falcor-react-redux/lib/utils/fetchDataUntilSettled';

const renderServerSide = true;

export function renderMiddleware(getDataSource, modules) {
    return function renderMiddleware(req, res) {
        const paths = getProxyPaths(req);
        const clientId = req.app.get('clientId') || '00000';
        try {
            const renderedResults = !renderServerSide ?
                Observable.of(renderFullPage(null, null, clientId, paths)) :
                renderAppWithHotReloading(modules, getDataSource(req), clientId, paths);

            renderedResults.take(1).subscribe({
                next(html) {
                    res.type('html').send(html);
                },
                error(e, error = e && e.stack || inspect(e, { depth: null })) {
                    console.error(error);
                    if (e.boundPath) {
                        console.error(stringify(e.boundPath));
                        console.error(stringify(e.shortedPath));
                    }
                    res.status(500).send(reactRenderToString(<pre>{error}</pre>));
                }
            });
        } catch (e) {
            const error = e && e.stack || inspect(e, { depth: null });
            console.error(error);
            res.status(500).send(reactRenderToString(<pre>{error}</pre>));
        }
    }
}

function renderAppWithHotReloading(modules, dataSource, clientId, paths) {
    return modules
        .map(({ App }) => ({
            App, falcor: new Model({
                source: dataSource,
                recycleJSON: true,
                // materialized: true,
                treatErrorsAsValues: true
            })
        }))
        .switchMap(
            ({ App, falcor }) => fetchDataUntilSettled({
                falcor, fragment: App.fragment
            }).takeLast(1),
            ({ App, falcor }, { data }) => ({ App, falcor, data })
        )
        .map(({ App, falcor, data }) => renderFullPage(data, falcor, clientId, paths));
}


function renderFullPage(data, falcor, clientId, paths = {}, html = '') {
    const { client, vendor } = webpackAssets;
    const { html: iconsHTML } = faviconStats;
    const { base = '', prefix = '' } = paths;
    return `
<!DOCTYPE html>
<html lang='en-us'>
    <head>
        ${base && `<base href="${base}">` || ''}
        <meta name='robots' content='noindex, nofollow'/>
        <meta http-equiv='x-ua-compatible' content='ie=edge'/>
        <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'/>${
            iconsHTML.join('\n')
        }
        <!--link rel='stylesheet' type='text/css' href='https://maxcdn.bootstrapcdn.com/bootstrap/latest/css/bootstrap.min.css'-->${
            client && client.css ?
        `<link rel='stylesheet' type='text/css' href='${`${client.css}`}'/>`: ''
        }
    </head>
    <body class='graphistry-body table-container'>
        <div id='root'>${html}</div>
        <script id='initial-state' type='text/javascript'>
            window.graphistryClientId = "${clientId}";
            var graphistryPath = "${ prefix || ''}";
            var __INITIAL_CACHE__ = ${stringify(falcor && falcor.getCache() || {})};
            var __INITIAL_STATE__ = ${false && data && data.toString(true)  || 'undefined'};
        </script>
        <script type="text/javascript" src="${`${vendor.js}`}"></script>
        <script type="text/javascript" src="${`${client.js}`}"></script>
    ${__DEV__ ? `\n` : `
        <script type="text/javascript">
            (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
            (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
            m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
            })(window,document,'script','//google-analytics.com/analytics.js','ga');
        </script>`
    }
    </body>
</html>`;
}


// When we're running behind the nginx reverse proxy, with multiple workers, subrequests needs to
// be of the form `/worker/xxx/<request path>`. This function examines the `X-Original-Uri` and
// `X-Resolved-Uri` headers added by our nginx config to get the base path and path prefix we should
// be using for subrequests.
function getProxyPaths(req) {
    logger.trace({req}, 'Finding proxy paths of request');

    // If these headers aren't set, assumed we're not begind a proxy
    if(!req.get('X-Graphistry-Prefix')) {
        logger.warn({req}, 'Could not find proxy URI headers; will not try to change URL paths');
        return { base: null, prefix: '' };
    }

    const prefix = `${req.get('X-Graphistry-Prefix')}`;
    const base = `${prefix}${req.originalUrl}`;

    logger.debug({req, base, prefix}, 'Resolved proxy paths');
    return {base, prefix};
}

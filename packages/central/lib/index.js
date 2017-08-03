require('source-map-support').install();


import { logger as log } from '@graphistry/common';
export const logger = log.createLogger('central', 'central/lib/server.js');

const config = require('@graphistry/config')();

import { resolve } from 'path';
import { parse as urlParse, format as urlFormat } from 'url';
import { Observable } from 'rxjs';
import { json as parseJsonEncoded } from 'body-parser';
import { simpleflake } from 'simpleflakes';

import { api as apiKey } from '@graphistry/common';
import { pickWorker, workerLastAssigned } from './worker-router.js';
import { logClientError } from './logClientError.js';
import { initWorkbookApi } from './rest-api';
import { renderSplashScreen } from './render-splash-screen';

import { HealthChecker } from './HealthChecker.js';
const healthcheck = HealthChecker();

import { Server as httpServer } from 'http';
import express from 'express';

// Path to the static assets to serve from the Graphistry docs-update module
import { docsUpdateAssetPath } from '@graphistry/docs-update';

// Path to static assets served by central
const assets = resolve(__dirname, '../assets');


export function start(port = config.HTTP_LISTEN_PORT, address = config.HTTP_LISTEN_ADDRESS) {
    const app = express();
    const server = httpServer(app);

    // Tell Express to trust reverse-proxy connections from localhost, linklocal, and private IP ranges.
    // This allows Express to expose the client's real IP and protocol, not nginx's.
    app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

    // viz-app should be sending client error messages directly to the viz-app server, not central,
    // but in case that fails (for some reason), we have this.
    app.post('/error', parseJsonEncoded({extended: true, limit: '512kb'}),
        (req, res) => logClientError(req, res, logger, (config.ENVIRONMENT === 'local')));

    apiKey.init(app);

    // Block access to any "package.json" files, and "/index.js"
    app.all(/.*\/package.json$/, (req, res, next) => res.sendStatus(404));
    app.all('/index.js', (req, res, next) => res.sendStatus(404));


    //TODO worker info
    app.get('/central/healthcheck', function(req, res) {
        const health = healthcheck();
        logger.info({...health, req, res, workerLastAssigned}, 'healthcheck');
        res.status(health.clear.success ? 200 : 500).json({...health.clear});
    });


    initWorkbookApi(app, config);

    app.all('/graph/*', handleVizAppRequest);
    app.all('/etl', handleWorkerRequest);
    app.all('/etlvgraph', handleWorkerRequest);

    // The 'docs-update' module provides the main static content we serve
    app.use('/graphistry', express.static(docsUpdateAssetPath));
    app.use('/', express.static(docsUpdateAssetPath));

    // If docs-update doesn't contain an asset, fallback to trying central's asset folder
    app.use('/graphistry', express.static(assets));
    app.use('/', express.static(assets));

    const serverListen = Observable.bindNodeCallback(server.listen.bind(server));
    return serverListen(port, address)
        .map(() => ({ address, port }))
        .catch((err) => {
            err.serverPort = port;
            err.serverAddress = address;
            return Observable.throw(err);
        });
}

function handleVizAppRequest(req, res) {

    let { query = {} } = req,
        { splashAfter } = query,
        showSplashScreen = false;

    if (splashAfter !== undefined) {
        if (splashAfter === true || splashAfter === 'true') {
            showSplashScreen = true;
        } else if (splashAfter === false || splashAfter === 'false') {
            showSplashScreen = false;
        } else if (typeof (splashAfter = parseInt(splashAfter, 10)) === 'number') {
            showSplashScreen = (splashAfter === splashAfter) &&
                               (Date.now() / 1000) - 20 >= splashAfter;
        }
    }

    if (!showSplashScreen && query.workbook) {
        return handleWorkerRequest(req, res);
    }

    query = { ...query };

    if (!query.workbook) {
        query.workbook = simpleflake().toJSON();
    }

    if (showSplashScreen) {
        delete query.splashAfter;
    }

    const reqURL = urlParse(req.originalUrl);
    const redirectURL = urlFormat({ ...reqURL, query, search: undefined });

    if (showSplashScreen) {
        return res.type('html').send(renderSplashScreen(redirectURL));
    }

    return res.redirect(redirectURL);
}

function handleWorkerRequest(req, res) {
    // const metadataFields = ['dataset', 'debugId'];
    // log.addMetadataField(_.pick(req.query, metadataFields));
    logger.debug({req, res}, 'Received request to be handled by a worker. ' +
        'Assigning client to a worker and redirecting request to it.');

    pickWorker()
        .map((worker) => {
            if(!config.PINGER_ENABLED) {
                return redirectUnproxiedRequest(req.url, res, worker);
            } else {
                return redirectNginxReqest(req.url, res, worker);
            }
        })
        .subscribe(
            ({redirectUrl, redirectedRes, worker}) => {
                logger.debug({req: req, res: redirectedRes, worker: worker, redirect: redirectUrl},
                    `Assigned client to worker and redirected request to ${redirectUrl}`);
            },
            (err) => {
                logger.error({err, req, res}, 'Error while assigning visualization worker');
            },
            () => {}
        );
}


// Redirects a request to a worker when we're behind an nginx reverse proxies. Uses a
// `X-Accel-Redirect` header, which tells nginx to retry the request using the path in that header.
// This happens transparently to the client; they just see a single request that is responded to by
// the worker.
function redirectNginxReqest(requestUrl, res, worker) {
    const { path } = urlParse(requestUrl);
    // Redirect to the named location (e.g. "@worker10001") for this worker. Redirection to a
    // non-named location (e.g. "/worker/10001/...") causes nginx to force the request method to be
    // "GET", which obviously causes problems if the original request was POST.
    const redirectUrl = `@worker${worker.port}`;

    res.set(`X-Accel-Redirect`, redirectUrl);
    res.send('');
    return {redirectUrl, res, worker};
}


// Redirects a request to a worker when the client is connected directly, without nginx reverse
// proxying the connection. In this case, we respond with a simple HTTP 307 redirect to the worker's
// direct address:port, which tells the browser to re-try the request at the given URL.
function redirectUnproxiedRequest(requestUrl, res, worker) {
    var requestUrlParsed = urlParse(requestUrl);

    requestUrlParsed.host = `${worker.hostname}:${worker.port}`;
    const redirectUrl = urlFormat(requestUrlParsed);

    res.redirect(307, redirectUrl);
    return {redirectUrl, res, worker};
}

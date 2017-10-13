const cookieParser = require('cookie-parser');
const SocketIOServer = require('socket.io');
const compression = require('compression');
const bodyParser = require('body-parser');
const { VError } = require('verror');
const convict = require('./config');
const express = require('express');
const bunyan = require('bunyan');
const helmet = require('helmet');
const mkdirp = require('mkdirp');
const http = require('http');
const path = require('path');
const hpp = require('hpp');
const fs = require('fs');

const pathPrefix = convict.get('pivotApp.dataDir');
const investigationPath = path.resolve(pathPrefix, 'investigations');
const pivotPath = path.resolve(pathPrefix, 'pivots');
mkdirp.sync(investigationPath);
mkdirp.sync(pivotPath);

const app = express();
const port = convict.get('port');
const host = convict.get('host');
const server = http.createServer(app);
const logger = require('./logger')(__filename);
const mountPoint = convict.get('pivotApp.mountPoint');
const io = (app.io = new SocketIOServer(server, {
    path: `${mountPoint}/socket.io`
}));

Error.stackTraceLimit = 3;
global.__graphistry_socket_io__ = io;
global.__graphistry_server_logger__ = logger;
global.__graphistry_convict_conf__ = app.convict = convict;

// Remove Express header.
app.disable('x-powered-by');

// Using helmet to secure Express with various HTTP headers
app.use(
    helmet({
        frameguard: false
    })
);

// Prevent HTTP parameter pollution.
app.use(bodyParser.urlencoded({ extended: true }));
app.use(hpp());

// Compress all requests
app.use(compression());

// Parse cookies
app.use(cookieParser());

// Tell Express to trust reverse-proxy connections from localhost, linklocal, and private IP ranges.
// This allows Express to expose the client's real IP and protocol, not the proxy's.
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Log all requests as the first action
app.use(function(req, res, next) {
    logger.info({ req, res }, 'HTTP request received by Express.js');
    next();
});

let pivotAppMiddleware;

// Run express as webpack dev server
if (process.env.NODE_ENV === 'development') {
    global.__DEV__ = true;
    const webpack = require('webpack');
    const clientWebpackConfig = require('./tools/webpack/webpack.config.client');
    const serverWebpackConfig = require('./tools/webpack/webpack.config.server');
    const compiler = webpack([clientWebpackConfig, serverWebpackConfig]);
    app.get('*.hot-update.json', express.static(path.join(process.cwd(), './www/public')));
    pivotAppMiddleware = require('webpack-universal-middleware')(compiler, {
        webpackHotMiddlware: { path: `/_hmr/` },
        webpackDevMiddleware: { serverSideRender: true },
        reporter: require('./src/webpack-dev-reporter')({
            logger,
            logWarnings: false
        })
    });
} else {
    const SERVER_STATS = require('./www/server-assets.json');
    pivotAppMiddleware = require(`./www/${SERVER_STATS.server.js}`).default;
}

app.use(mountPoint, pivotAppMiddleware, requestErrorHandler);
app.get('/', (req, res) => res.redirect(`${mountPoint}/`));
app.get('*', (req, res) => res.status(404).send('Not found'));

if (port) {
    server.listen(port, host, function(err) {
        if (err) {
            logger.error({ err }, `😭  Failed to start pivot-app:server`);
        } else {
            const { port: _port, address: _host } = this.address();
            logger.info(`Started pivot-app:server at http://${_host}:${_port}`);
            logger.info(
                {
                    host: _host,
                    port: _port,
                    __dirname: __dirname,
                    'process.pid:': process.pid,
                    NODE_ENV: process.env.NODE_ENV,
                    time: new Date().toISOString(),
                    root: require('path').resolve(),
                    'convict.env': convict.get('env'),
                    'convict.host': convict.get('host'),
                    'convict.port': convict.get('port')
                },
                'Environment constants'
            );
        }
    });
} else {
    logger.error(`😭  Failed to start pivot-app:server. No PORT environment variable specified`);
}

function requestErrorHandler(err, req, res, next) {
    logger.warn(
        { req, res, err },
        'An error occured while processing the HTTP request. Responding to the request with an error code and message, if possible.'
    );
    if (res.headersSent) {
        logger.info(
            { req, res },
            'requestErrorHandler not sending error to client, because headers (and likely data) has already been sent to the client. The error will only be logged server-side, and the request will be ended in its current state.'
        );
        res.end();
        return;
    }
    const { httpStatus = 500 } = VError.info(err);
    // Whether the client prefers JSON over text/HTML, given any `Accepts` headers in the request
    const wantsJsonResponse =
        req.is('json') ||
        req.accepts(['text/html', 'text/*', 'application/json']) === 'application/json';

    res
        .status(httpStatus)
        .send((wantsJsonResponse && { success: false, msg: err.message }) || err.message);
}

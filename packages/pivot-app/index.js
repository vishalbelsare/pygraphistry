const cookieParser = require('cookie-parser');
const SocketIOServer = require('socket.io');
const compression = require('compression');
const convict = require('./config');
const express = require('express');
const helmet = require('helmet');
const mkdirp = require('mkdirp');
const chalk = require('chalk');
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
const logger = require('./logger')(__filename);
const mountPoint = convict.get('pivotApp.mountPoint');
const io = app.io = new SocketIOServer({
    serveClient: false,
    path: `${mountPoint}/socket.io`
});

Error.stackTraceLimit = 3;
global.__graphistry_socket_io__ = io;
global.__graphistry_server_logger__ = logger;
global.__graphistry_convict_conf__ = app.convict = convict;

// Remove Express header.
app.disable('x-powered-by');

// Using helmet to secure Express with various HTTP headers
app.use(helmet({
    frameguard: false
}));

// Prevent HTTP parameter pollution.
app.use(hpp());

// Compress all requests
app.use(compression());

// Parse cookies
app.use(cookieParser());

// Tell Express to trust reverse-proxy connections from localhost, linklocal, and private IP ranges.
// This allows Express to expose the client's real IP and protocol, not the proxy's.
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Log all requests as the first action
// app.use(function(req, res, next) {
//     logger.info({req, res}, 'HTTP request received by Express.js');
//     next();
// });

//useful for testing
app.get(`${mountPoint}/echo`, function(req, res) {
    logger.info('echo', { ...(req.query||{}) });
    res.status(200).json(req.query);
});

// Run express as webpack dev server
if (process.env.NODE_ENV === 'development') {
    global.__DEV__ = true;
    const webpack = require('webpack');
    const clientWebpackConfig = require('./tools/webpack/webpack.config.client');
    const serverWebpackConfig = require('./tools/webpack/webpack.config.server');
    const compiler = webpack([clientWebpackConfig, serverWebpackConfig]);
    app.use(require('webpack-universal-middleware')(compiler, {
        webpackHotMiddlware: { path: `${mountPoint}_hmr/` },
        webpackDevMiddleware: { serverSideRender: true },
        reporter: require('./src/webpack-dev-reporter')({
            logger, logWarnings: false
        }),
    }));
} else {
    const SERVER_STATS = require('./www/server-assets.json');
    app.use(require(`./www/${SERVER_STATS.server.js}`).default);
}

app.get('*', (req, res) => res.status(404).send('Not found'));

if (port) {
    io.listen(app.listen(port, host, function (err) {
        if (err) {
            logger.error({ err }, `😭  Failed to start pivot-app:server`);
        } else {
            logger.info(`Started pivot-app:server at http://${host}:${port}`);
            console.log(
                [
                    ``,
                    `***********************************************************`,
                    `Express app listening at http://${host}:${port}`,
                    `Time        : ${(new Date()).toDateString()}`,
                    convict.get('env') !== 'development' ? '' :
                    `args        : "${process.argv.slice(2).join('", "')}"`,
                    `NODE_ENV    : ${process.env.NODE_ENV}`,
                    `process.pid : ${process.pid}`,
                    `__dirname   : ${__dirname}`,
                    `root        : ${path.resolve()}`,
                    `***********************************************************`,
                    ``,
                ].join("\n")
            );

            // if (config.ENVIRONMENT === 'local') {
            //     // Open a browser window
            //     require('./tools/openBrowser').default(port);
            // }
        }
    }));
} else {
    logger.error(`😭  Failed to start pivot-app:server`);
    console.error(chalk.red('==> 😭  No PORT environment variable specified'));
}

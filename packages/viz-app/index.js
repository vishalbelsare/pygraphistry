const { createLogger } = require('@graphistry/common/logger');
const compress = require('@graphistry/node-pigz');
const _config = require('@graphistry/config');
const cookieParser = require('cookie-parser');
const SocketIOServer = require('socket.io');
const compression = require('compression');
const convict = require('./config');
const express = require('express');
const helmet = require('helmet');
const chalk = require('chalk');
const path = require('path');
const hpp = require('hpp');
const fs = require('fs');

const app = express();
const config = _config();
const port = convict.get('port');
const host = convict.get('host');
const logger = createLogger('viz-app');
const io = app.io = new SocketIOServer({ serveClient: false });

global.window = global;

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

let serverMiddleware;

// Run express as webpack dev server
if (process.env.NODE_ENV === 'development' && config.ENVIRONMENT === 'local') {
    global.__DEV__ = true;
    const webpack = require('webpack');
    const clientWebpackConfig = require('./tools/webpack/webpack.config.client');
    const serverWebpackConfig = require('./tools/webpack/webpack.config.server');
    const compiler = webpack([clientWebpackConfig, serverWebpackConfig]);
    app.use(require('webpack-universal-middleware')(compiler, {
        webpackDevMiddleware: {
            serverSideRender: true
        }
    }));
} else {
    const SERVER_STATS = require('./www/server-assets.json');
    app.use(require(`./www/${SERVER_STATS.server.js}`).default);
}

if (port) {
    io.listen(app.listen(port, host, function (err) {
        if (err) {
            logger.error({ err }, `😭  Failed to start viz-app:server`);
        } else {
            logger.info(`Started viz-app:server at http://${host}:${port}`);
            console.log(
                [
                    ``,
                    `***********************************************************`,
                    `Express app listening at http://${host}:${port}`,
                    `Time        : ${(new Date()).toDateString()}`,
                    config.ENVIRONMENT !== 'local' ? '' :
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
    logger.error(`😭  Failed to start viz-app:server`);
    console.error(chalk.red('==> 😭  No PORT environment variable specified'));
}

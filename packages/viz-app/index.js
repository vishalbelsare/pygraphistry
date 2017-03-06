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
const io = new SocketIOServer({ serveClient: false });

global.window = global;

// Remove Express header.
app.disable('x-powered-by');

// Using helmet to secure Express with various HTTP headers
app.use(helmet());

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
if (process.env.NODE_ENV === 'production') {
    const PROD_SERVER_PATH = path.join(process.cwd(), './www/server.js');
    const CLIENT_STATS_PATH = path.join(process.cwd(), './www/webpack-client-stats.json');
    serverMiddleware = require(PROD_SERVER_PATH).default(require(CLIENT_STATS_PATH));
} else {
    global.__DEV__ = true;
    const webpack = require('webpack');
    const clientWebpackConfig = require('./tools/webpack/webpack.config.client');
    const serverWebpackConfig = require('./tools/webpack/webpack.config.server');
    const compiler = webpack([clientWebpackConfig, serverWebpackConfig]);

    const clientCompiler = compiler.compilers.find(compiler => compiler.name === 'client');
    const serverCompiler = compiler.compilers.find(compiler => compiler.name === 'server');
    serverCompiler.outputFileSystem.readFileSync = fs.readFileSync.bind(fs);
    app.use(require('webpack-dev-middleware')(compiler, {
        hot: true, noInfo: true, stats: 'minimal',
        publicPath: clientWebpackConfig.output.publicPath,
    }));

    // Only the client bundle needs to be passed to `webpack-hot-middleware`.
    app.use(require('webpack-hot-middleware')(clientCompiler));

    serverMiddleware = require('webpack-hot-server-middleware')(compiler, {
        chunkName: 'server'
    });
}

app.use((req, res, next) => {
    req.io = io;
    req.app = app;
    req.config = config;
    req.logger = logger;
    serverMiddleware(req, res, next);
});

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

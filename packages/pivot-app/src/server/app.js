import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';
import SocketIOServer from 'socket.io';
import bunyan from 'bunyan';
import compression from 'compression';
import conf from './config.js';
import { authenticateMiddleware } from './middleware';
import logger from '../shared/logger.js';

const log = logger.createLogger(__filename);

const mountPoint = `/pivot`;

const expressApp = express();
const httpServer = http.createServer(expressApp);
const socketServer = SocketIOServer(httpServer, {path: `${mountPoint}/socket.io`});

expressApp.disable('x-powered-by');
expressApp.use(compression());
expressApp.use(authenticateMiddleware());

expressApp.use(mountPoint, express.static('./build/public'));

expressApp.post(
    `${mountPoint}/error`,
    bodyParser.json({limit: '512kb'}),
    (req, res) => {
        const record = req.body;
        log[bunyan.nameFromLevel[record.level]](record, record.msg);
        res.status(204).send();
    }
);

/*
// history-api-fallback, uncomment this if you want to send index.html for all GET request and let client do the rendering, e.g single page expressApplication
expressApp.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    res.sendFile('index.html', { root: './build/public' }, e => e && next())
  } else next()
})
*/

httpServer.listen(conf.get('port'), conf.get('host'), function () {
    log.info(`Express expressApp listening at http://${this.address().address}:${this.address().port}`);
    log.info({
        NODE_ENV: conf.get('env'),
        'process.pid:': process.pid,
        '__dirname': __dirname,
        'root': require('path').resolve()
    }, 'Environment constants');
});

export { expressApp, socketServer };

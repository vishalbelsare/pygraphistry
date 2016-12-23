import express from 'express';
import bodyParser from 'body-parser';
import bunyan from 'bunyan';
import compression from 'compression';
import conf from './config.js';
import { authenticateMiddleware } from './middleware';
import logger from '../shared/logger.js';
const log = logger.createLogger(__filename);


const app = express();

app.disable('x-powered-by');
app.use(compression());
app.use(authenticateMiddleware());

app.use(express.static('./build/public'))

app.post(
    '/error',
    bodyParser.json({limit: '512kb'}),
    (req, res) => {
        const record = req.body;
        log[bunyan.nameFromLevel[record.level]](record, record.msg);
        res.status(204).send();
    }
);

/*
// history-api-fallback, uncomment this if you want to send index.html for all GET request and let client do the rendering, e.g single page application
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    res.sendFile('index.html', { root: './build/public' }, e => e && next())
  } else next()
})
*/

app.listen(conf.get('port'), conf.get('host'), function () {
    log.info(`Express app listening at http://${this.address().address}:${this.address().port}`);
    log.info({
        NODE_ENV: conf.get('env'),
        'process.pid:': process.pid,
        '__dirname': __dirname,
        'root': require('path').resolve()
    }, 'Environment constants');
})

export default app

import express from 'express';
import compression from 'compression';
import logger from '@graphistry/common/logger2.js';
const log = logger.createLogger('pivot-app', __filename);


const app = express()

app.disable('x-powered-by')
app.use(compression())
app.use(express.static('./build/public'))

/*
// history-api-fallback, uncomment this if you want to send index.html for all GET request and let client do the rendering, e.g single page application
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    res.sendFile('index.html', { root: './build/public' }, e => e && next())
  } else next()
})
*/

app.listen(process.env.PORT || 3000, process.env.HOST || 'localhost', function () {
    log.info(`Express app listening at http://${this.address().address}:${this.address().port}`);
    log.info({
        NODE_ENV: process.env.NODE_ENV,
        'process.pid:': process.pid,
        '__dirname': __dirname,
        'root': require('path').resolve()
    }, 'Environment constants');
})

export default app

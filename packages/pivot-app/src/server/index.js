import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import createLogger from 'pivot-shared/logger';
import configureRenderMiddleware from './render';
import { createAppModel } from 'pivot-shared/models';
import configureServices from 'pivot-shared/services';
import configureFalcorRouter from 'pivot-app/router/falcor';
import configureSocketListeners from 'pivot-app/server/socket';
import configureFalcorModelFactory from 'pivot-app/router/model';
import { HealthChecker, authenticateMiddleware } from './middleware';

const log = createLogger(__filename);
const io = global.__graphistry_socket_io__;
const convict = global.__graphistry_convict_conf__;

if (convict.get('env') === 'development') {
    require('./hot-server.js');
} else {
    const buildNum = __BUILDNUMBER__ === undefined ? 'local build' : `build #${__BUILDNUMBER__}`;
    const buildDesc = {branch:__GITBRANCH__, commit:__GITCOMMIT__, build:__BUILDNUMBER__, builton: __BUILDDATE__};
    log.info(buildDesc, `Starting ${buildNum}`);
}

const app = new express.Router();
const mountPoint = convict.get('pivotApp.mountPoint');
const pivotDataPath = convict.get('pivotApp.dataDir');
const pivotPath = path.resolve(pivotDataPath, 'pivots');
const investigationPath = path.resolve(pivotDataPath, 'investigations');

let services, getDataSource, servicesConfig = {
    pivotPath,
    investigationPath,
    app: createAppModel(),
    investigationsByIdCache: {}
};

getDataSource = configureFalcorRouter(
     services = configureServices(convict, servicesConfig));

// Hot reload the Falcor Router services
if (module.hot) {
    module.hot.accept('pivot-shared/services', () => {
        let nextConfigureServices = require('pivot-shared/services').default; // eslint-disable-line global-require
        getDataSource = configureFalcorRouter(
             services = nextConfigureServices(convict, servicesConfig));
    });
}

configureSocketListeners(io, (req) => getDataSource(req, { streaming: true }));

// Use authentication middleware
app.use(authenticateMiddleware(convict));

// Install client error-logger route
app.post(
    `${mountPoint}/error`,
    bodyParser.json({ limit: '512kb' }),
    (req, res) => {
        const record = req.body;
        log[bunyan.nameFromLevel[record.level]](record, record.msg);
        res.status(204).send();
    }
);

// Install healthcheck route
app.get(`${mountPoint}/healthcheck`, ((healthcheck) => (req, res) => {
    const health = healthcheck();
    log.info({...health, req, res}, 'healthcheck');
    res.status(health.clear.success ? 200 : 500).json({...health.clear});
})(HealthChecker()));

app.use(mountPoint, express.static(path.join(process.cwd(), './www/public')));
app.use('*.hot-update.json', express.static(path.join(process.cwd(), './www/public')));
app.use(`${mountPoint}/public`, express.static(path.join(process.cwd(), './www/public')));

const renderPageRouter = new express.Router();
const renderMiddleware = configureRenderMiddleware(
    convict, configureFalcorModelFactory(
        (req) => getDataSource(req, { streaming: false })));

// Add render routes
['', ':activeScreen', ':activeScreen/:investigationId'].forEach((renderPath) => {
    renderPageRouter.get(`/${renderPath}`, renderMiddleware);
});

app.use(`${mountPoint}`, renderPageRouter);

export default app;
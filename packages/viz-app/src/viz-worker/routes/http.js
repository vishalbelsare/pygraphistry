import path from 'path';
import express from 'express';
import * as bodyParser from 'body-parser';
import { renderMiddleware } from '../middleware';
import { getDataSourceFactory } from 'viz-shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

import { logger as log } from '@graphistry/common';
const logger = log.createLogger('viz-server:client-errors');

import { HealthChecker } from '../services/HealthChecker.js';
const healthcheck = HealthChecker();


export function httpRoutes(services, modules) {
    const getDataSource = getDataSourceFactory(services);
    return [{
        route: `/graph/graph.html`,
        use: renderMiddleware(getDataSource, modules)
    }, {
        route: `/graph/kernels/*`,
        use: (req, res, next) => res.status(404).send()
    }, {
        // Block access to viz-server's source code
        route: `/graph/viz-server.js(.map)?`,
        use: (req, res, next) => res.status(404).send()
    }, {
        // NB: Normally, nginx routes `/error` to central, so it can log client errors instead of
        // viz-app. However, if you're running locally (with no central or nginx), it's convienant
        // to log client erros with your normal log output (usually to the terminal).
        route: '/error',
        post:  [
            bodyParser.json({extended: true, limit: '512kb'}),
            (req, res) => {
                logger.error(req.body, `Client error: ${req.body.msg || 'no message'}`);
                res.status(200).send();
            }
        ]
    }, {
        route: `/graph/model.json`,
        use: falcorMiddleware(getDataSource)
    }, {
        route: `/graph/healthcheck`,
        use: (req, res, next) => {
            const health = healthcheck();
            logger.info({...health, req, res}, 'healthcheck');
            res.status(health.clear.success ? 200 : 500).json({...health.clear});
        }
    }, {
        route: '/graph',
        use: express.static(path.resolve(), { fallthrough: false })
    }];
}

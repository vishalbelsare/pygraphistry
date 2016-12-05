import path from 'path';
import express from 'express';
import * as bodyParser from 'body-parser';
import { renderMiddleware } from '../middleware';
import { getDataSourceFactory } from 'viz-shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

import { logger as log } from '@graphistry/common';
const logger = log.createLogger('viz-server:client-errors');

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
        route: '/error',
        use: bodyParser.json(),
        post: (req, res) => {
            logger.error({error: {...req.body}}, `Client error: ${req.body.msg || 'no message'}`);
            res.status(200).send();
        }
    }, {
        route: `/graph/model.json`,
        use: falcorMiddleware(getDataSource)
    }, {
        route: '/graph',
        use: express.static(path.resolve(), { fallthrough: false })
    }];
}

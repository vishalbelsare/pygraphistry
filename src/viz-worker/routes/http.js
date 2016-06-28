import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import { renderMiddleware } from '../middleware';
import { getDataSourceFactory } from '../../viz-shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

export function httpRoutes(services, routesSharedState, modules) {
    const getDataSource = getDataSourceFactory(services, routesSharedState);
    return [{
        use: bodyParser.urlencoded({ extended: false })
    }, {
        route: `/graph/model.json`,
        use: falcorMiddleware(getDataSource)
    }, {
        route: `/graph/index.html`,
        use: renderMiddleware(getDataSource, modules)
    }, {
        route: `/graph/kernels/*`,
        use: (req, res, next) => res.status(404).send()
    }, {
        route: '/graph',
        use: express.static(path.resolve('www'), { fallthrough: false })
    }];
}

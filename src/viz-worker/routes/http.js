import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import { renderMiddleware } from '../middleware';
import { getDataSourceFactory } from '../../viz-shared/middleware';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';

export function httpRoutes(services, modules) {
    const getDataSource = getDataSourceFactory(services);
    return [{
        route: `/graph/index.html`,
        use: renderMiddleware(getDataSource, modules)
    }, {
        route: `/graph/kernels/*`,
        use: (req, res, next) => res.status(404).send()
    }, {
        route: '/graph/error',
        post: (req, res) => res.status(200).send()
    }, {
        route: `/graph`,
        use: bodyParser.urlencoded({ extended: false })
    }, {
        route: `/graph/model.json`,
        use: falcorMiddleware(getDataSource)
    }, {
        route: '/graph',
        use: express.static(path.resolve(), { fallthrough: false })
    }];
}

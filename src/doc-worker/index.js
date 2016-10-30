import path from 'path';
import React from 'react';
import express from 'express';
import _config from '@graphistry/config';
import ReactDomServer from 'react-dom/server';
import { cache as Cache } from '@graphistry/common';
import removeExpressRoute from 'express-remove-route';
import * as FalcorDocRouter from 'falcor-doc-router';
import { Observable, Subscription } from 'rxjs';
import { getDataSourceFactory } from '../viz-shared/middleware';
import GraphDescriptor from 'falcor-doc-router/graph-descriptor';
import { routes as falcorRoutes } from '../viz-shared/routes/falcor';
import { dataSourceRoute as falcorMiddleware } from 'falcor-express';
import { loadViews, loadLabels, loadVGraph, loadWorkbooks } from '../viz-worker/services';

const config = _config();
const s3Cache = new Cache(config.LOCAL_DATASET_CACHE_DIR, config.LOCAL_DATASET_CACHE);

export function docWorker(app, server, sockets, caches) {

    const { requests } = server;
    const { nBodiesById = {}, workbooksById = {} } = caches;

    return Observable.using(onDispose, onSubscribe);

    function onDispose() {
        return new Subscription(function disposeDocWorker() {
            removeExpressRoute(app, '/doc');
            removeExpressRoute(app, '/doc/model.json');
            removeExpressRoute(app, '/doc/index.html');
        });
    }

    function onSubscribe(subscription) {

        const loadConfig = () => Observable.of(config);
        const loadWorkbooksById = loadWorkbooks(workbooksById, config, s3Cache);
        const loadViewsById = loadViews(workbooksById, nBodiesById, config, s3Cache);
        const loadLabelsByIndexAndType = loadLabels(workbooksById, nBodiesById, config, s3Cache);

        const routeServices = {
            loadConfig,
            loadViewsById,
            loadWorkbooksById,
            loadLabelsByIndexAndType
        };

        const getDataSource = getDataSourceFactory(routeServices);

        app.use('/doc', express.static(path.resolve(), { fallthrough: true }));
        app.use('/doc/model.json', falcorMiddleware(getDataSource));
        app.use('/doc/index.html', function (req, res) {

            try {

                const descriptor = FalcorDocRouter
                    .createClass(falcorRoutes(routeServices))
                    .descriptor();

                const reactEl = React.createElement(GraphDescriptor, {
                    descriptor, expanded: true
                });
                const html = ReactDomServer.renderToStaticMarkup(reactEl);

                res.set('Content-Type', 'text/html')
                    .send(html);
            } catch (e) {
                console.log(e && e.stack || e);
                res.send(`<pre>${e && e.stack || e}</pre>`);
            }
        });

        return requests.startWith({ isActive: true });
    }
}

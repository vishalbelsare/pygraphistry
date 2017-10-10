import { Observable } from 'rxjs/Observable';

import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/takeLast';
import 'rxjs/add/operator/timeoutWith';
import 'rxjs/add/operator/defaultIfEmpty';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/empty';
import 'rxjs/add/observable/forkJoin';
import 'rxjs/add/observable/bindCallback';
import 'rxjs/add/observable/bindNodeCallback';

import template from './template';
import App from 'viz-app/containers/app';

import { Model } from '@graphistry/falcor-model-rxjs';
import { createLogger } from '@graphistry/common/logger';
const logger = createLogger('viz-app:server:express:renderer');

import RedBox from 'redbox-react';
import { renderToString } from 'react-dom/server';

function configureRender(config, getDataSource) {
  let AppContainer = App;

  // Hot reload the server AppContainer
  if (module.hot) {
    module.hot.accept('viz-app/containers/app', () => {
      AppContainer = require('viz-app/containers/app').default; // eslint-disable-line global-require
    });
  }

  return function renderMiddleware(req, res) {
    const paths = getProxyPaths(req);
    const clientId = req.app.get('clientId') || '00000';
    const model = new Model({ recycleJSON: true, source: getDataSource(req) });
    const clientAssets = ((res.locals &&
      res.locals.webpackStats &&
      res.locals.webpackStats.toJson()) ||
      require('./client-stats.json')
    ).assetsByChunkName;

    // Wrap in Observable.defer in case `template` or `AppContainer.load` throws an error
    return Observable.defer(() => {
      // If __DISABLE_SSR__ = true, disable server side rendering
      if (__DISABLE_SSR__) {
        return Observable.of({
          status: 200,
          payload: template({ paths, clientId })
        });
      }
      return AppContainer.load({ falcor: model }).map(() => ({
        status: 200,
        payload: template({
          paths,
          clientId,
          clientAssets,
          initialState: model.getCache()
          // reactRoot: renderToString(
          //     <App falcor={model} key='viz-client' params={req.query} store={{
          //         dispatch() {},
          //         getState() {
          //             return ((model || {})._seed || {}).json || {};
          //         },
          //         subscribe() { return () => {}; },
          //     }}/>
          // )
        })
      }));
    }).catch(err => {
      logger.error({ err }, `error rendering graph.html`);
      // If not in local dev mode, re-throw the error so we can 502 the request.
      if (config.ENVIRONMENT !== 'local') {
        return Observable.throw(err);
      }
      // If in local dev mode, render an error page
      return Observable.of({
        status: 500,
        payload: renderToString(<RedBox error={err} />)
      });
    });
  };
}

// When we're running behind the nginx reverse proxy, with multiple workers, subrequests needs to
// be of the form `/worker/xxx/<request path>`. This function examines the `X-Original-Uri` and
// `X-Resolved-Uri` headers added by our nginx config to get the base path and path prefix we should
// be using for subrequests.
function getProxyPaths(req) {
  logger.trace({ req }, 'Finding proxy paths of request');

  // If these headers aren't set, assumed we're not begind a proxy
  if (!req.get('X-Graphistry-Prefix')) {
    logger.warn({ req }, 'Could not find proxy URI headers; will not try to change URL paths');
    return { base: null, prefix: '' };
  }

  const prefix = `${req.get('X-Graphistry-Prefix')}`;
  const base = `${prefix}${req.originalUrl}`;

  logger.debug({ req, base, prefix }, 'Resolved proxy paths');
  return { base, prefix };
}

export { configureRender };
export default configureRender;

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
import { Model } from '@graphistry/falcor-model-rxjs';
import { createLogger } from '@graphistry/common/logger';
const logger = createLogger('viz-app:server:express:renderer');

import RedBox from 'redbox-react';
import { renderToString } from 'react-dom/server';

function configureRender(getDataSource) {

    let App = require('viz-app/containers/app').default; // eslint-disable-line global-require

    // Hot reload the server App container
    if (module.hot) {
        module.hot.accept('viz-app/containers/app', () => {
            App = require('viz-app/containers/app').default; // eslint-disable-line global-require
        });
    }

    return function renderMiddleware(req, res) {

        const paths = getProxyPaths(req);
        const clientId = req.app.get('clientId') || '00000';
        const model = new Model({ recycleJSON: true, source: getDataSource(req) });

        return Observable.defer(() => {
            // If __DISABLE_SSR__ = true, disable server side rendering
            if (__DISABLE_SSR__) {
                return Observable.of({
                    status: 200, payload: template({ clientId, paths })
                });
            } else {
                const fakeStore = {
                    dispatch() {},
                    getState() {
                        return ((model || {})._seed || {}).json || {};
                    },
                    subscribe() { return () => {}; },
                };
                return App
                    .load({ falcor: model })
                    .map(() => ({
                        status: 200,
                        payload: template({
                            clientId, paths,
                            initialState: model.getCache(),
                            reactRoot: ''
                            // reactRoot: renderToString(
                            //     <App falcor={model}
                            //          key='viz-client'
                            //          store={fakeStore}
                            //          params={req.query}/>
                            // )
                        })
                    }))
                    .catch((err) => {
                        logger.error({ err }, `error rendering graph.html`);
                        return !__DEV__ ? Observable.throw(err) : Observable.of({
                            status: 500, payload: renderToString(<RedBox error={err}/>)
                        });
                    });
            }
        })
        .catch((err) => {
            logger.error({ err }, `error loading graph.html`);
            return !__DEV__ ? Observable.throw(err) : Observable.of({
                status: 500, payload: renderToString(<RedBox error={err}/>)
            });
        });
    }
}

// When we're running behind the nginx reverse proxy, with multiple workers, subrequests needs to
// be of the form `/worker/xxx/<request path>`. This function examines the `X-Original-Uri` and
// `X-Resolved-Uri` headers added by our nginx config to get the base path and path prefix we should
// be using for subrequests.
function getProxyPaths(req) {
    logger.trace({ req }, 'Finding proxy paths of request');

    // If these headers aren't set, assumed we're not begind a proxy
    if(!req.get('X-Graphistry-Prefix')) {
        logger.warn({req}, 'Could not find proxy URI headers; will not try to change URL paths');
        return { base: null, prefix: '' };
    }

    const prefix = `${req.get('X-Graphistry-Prefix')}`;
    const base = `${prefix}${req.originalUrl}`;

    logger.debug({req, base, prefix}, 'Resolved proxy paths');
    return {base, prefix};
}

export { configureRender };
export default configureRender;

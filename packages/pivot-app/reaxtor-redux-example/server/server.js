import { Observable, Scheduler } from 'rxjs';
var webpack = require('webpack');
var webpackDevMiddleware = require('webpack-dev-middleware');
var webpackHotMiddleware = require('webpack-hot-middleware');
var config = require('../webpack.config');

var getInvestigationDataSource = require('../createInvestigationDataSource.js');
var getDataSource = getInvestigationDataSource.getInvestigationDataSource

var port = 3000;
var express = require('express');
var app = new express();
var bodyParser = require('body-parser');
var FalcorServer = require('falcor-express');
var falcorRouterDemoFactory = require('falcor-router-demo');

import App from '../common/containers/App';
import { configureStore } from '../common/store/configureStore';

var Model = require('reaxtor-falcor').Model;
var connect = require('reaxtor-redux').connect;
var Provider = require('react-redux').Provider;
var React = require('react');
var ReactServer = require('react-dom/server');

var compiler = webpack(config);

app.use(express.static('./server', { fallthrough: true }));

app.use(webpackDevMiddleware(compiler, {
    noInfo: true,
    publicPath: config.output.publicPath
}));
app.use(webpackHotMiddleware(compiler));

var shouldRenderServerSide = false;

app.get("/", function(req, res) {
    if (!shouldRenderServerSide) {
        // Send the rendered page back to the client
        res.send(renderFullPage('', {}));
    } else {

        var ConnectedApp = connect(App);
        var store = configureStore({});
        var model = new Model({
            // scheduler: Scheduler.asap,
            source: getFalcorDataSource(req)
        });

        Observable
            .from(store)
            .skip(1)
            .debounceTime(100).take(1)
            .subscribe(() => {
                res.send(renderFullPage(ReactServer.renderToString(
                  <Provider store={store}>
                    <ConnectedApp falcor={model}/>
                  </Provider>
                ), model.getCache()));
            });
    }
});

app.use(bodyParser.urlencoded({
    extended: false
}));

// Simple middleware to handle get/post
app.use('/model.json', FalcorServer.dataSourceRoute(getFalcorDataSource));

app.listen(port, function(error) {
    if (error) {
        console.error(error);
    } else {
        console.info("==> 🌎  Listening on port %s. Open up http://localhost:%s/ in your browser.", port, port);
    }
});

function renderFullPage(html = '', preloadedState = {}) {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Reaxtor movies list example</title>
        <link rel="stylesheet" type="text/css" href="/index.css"/>
      </head>
      <body>
        <div id="app">${html}</div>
        <script>
          window.__PRELOADED_STATE__ = ${
            JSON.stringify(preloadedState).replace(/</g, '\\x3c')}
        </script>
        <script src="/static/bundle.js"></script>
      </body>
    </html>
    `;
}

function getFalcorDataSource(request) {
    // Passing in the user ID, this should be retrieved via some auth system
    //return falcorRouterDemoFactory("1");
    const datasource = getInvestigationDataSource.getInvestigationDataSource();
    return datasource;
    //console.log("Investigation datasource", datasource);
    //return datasource;
}

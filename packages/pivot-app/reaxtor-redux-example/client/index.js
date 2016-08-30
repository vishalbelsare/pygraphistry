import React from 'react';
import App from '../common/containers/App';
import { Scheduler } from 'rxjs';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import { connect } from 'reaxtor-redux';
import { Model } from 'reaxtor-falcor';
import DataSource from 'falcor-http-datasource';
import { configureStore } from '../common/store/configureStore';

const ConnectedApp = connect(App);

render(
    <Provider store={configureStore()}>
        <ConnectedApp falcor={getRootModel()}/>
    </Provider>,
    document.getElementById('app')
)

function getRootModel() {
    return new Model({
        scheduler: Scheduler.async,
        source: new DataSource('/model.json'),
        cache: window.__PRELOADED_STATE__ || {}
    });
}

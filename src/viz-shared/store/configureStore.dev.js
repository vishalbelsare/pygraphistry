import createLogger from 'redux-logger';
import { DevTools } from '../components';
import rootReducer from '../reducers';
import scene from '../reducers/scene';
import toolbar from '../reducers/toolbar';
import settings from '../reducers/settings';
import expressions from '../reducers/expressions';
import { compose, createStore, applyMiddleware } from 'redux';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState) {

    const store = createStore(rootReducer, initialState, compose(
            applyMiddleware(createEpicMiddleware(
                combineEpics(scene, toolbar, settings, expressions)
            ), createLogger()),
            DevTools.instrument()
        )
    );

    if (module.hot) {
        // Enable Webpack hot module replacement for reducers
        module.hot.accept('../reducers', () => {
            const nextRootReducer = require('../reducers').default;
            store.replaceReducer(nextRootReducer);
        });
    }

    return store;
}

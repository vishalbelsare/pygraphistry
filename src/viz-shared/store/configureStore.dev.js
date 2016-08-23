import createLogger from 'redux-logger';
import { DevTools } from '../components';
import rootReducer from '../reducers';
import toolbar from '../reducers/toolbar';
import { compose, createStore, applyMiddleware } from 'redux';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState) {

    const store = createStore(rootReducer, initialState, compose(
            applyMiddleware(createEpicMiddleware(
                combineEpics(toolbar)
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

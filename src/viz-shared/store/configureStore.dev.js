import createLogger from 'redux-logger';
import DevTools from '../app/DevTools';
import rootReducer from '../reducers';

import toolbarEpic from '../toolbar/epics';
import settingsEpic from '../settings/epics';

import { compose, createStore, applyMiddleware } from 'redux';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState) {

    // const fragmentMiddleware = createFragmentMiddleware(rootModel, rootFragment);

    const store = createStore(rootReducer, initialState, compose(
            applyMiddleware(createEpicMiddleware(
                combineEpics(toolbarEpic, settingsEpic)
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

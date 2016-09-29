import deepExtend from 'deep-extend';
import createLogger from 'redux-logger';
import { DevTools } from '../components';
import rootReducer from '../reducers';
import toolbar from '../reducers/toolbar';
import settings from '../reducers/settings';
import expressions from '../reducers/expressions';
import { compose, createStore, applyMiddleware } from 'redux';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState) {

    const store = createStore(
        rootReducer, initialState, compose(
            // (createStore) =>
            //     (reducer, initialState, enhancer) =>
            //         createStore(deepExtendReducer(reducer), initialState, enhancer),
            applyMiddleware(
                createEpicMiddleware(
                    combineEpics(toolbar, settings, expressions)
                ),
                createLogger({
                    diff: true,
                    collapsed: collapseFalcorUpdates,
                    stateTransformer: deepExtendState
                })),
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

function collapseFalcorUpdates(getState, action) {
    return action.type === 'falcor-react-redux/update';
}

function deepExtendState(state) {
    return deepExtend({}, state);
}

function deepExtendReducer(reducer) {
    return function deepExtendReducer(state = {}, action) {
        return deepExtend({}, reducer(state, action));
    }
}

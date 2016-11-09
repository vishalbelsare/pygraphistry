import deepExtend from 'deep-extend';
import createLogger from 'redux-logger';
// import { DevTools } from '../components';
import { compose, createStore, applyMiddleware } from 'redux';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState, rootReducer, epics) {

    const store = createStore(
        rootReducer, initialState, compose(
            applyMiddleware(
                createEpicMiddleware(
                    combineEpics(...epics)
                )
                // ,createLogger({
                //     diff: true,
                //     collapsed: true,
                //     // stateTransformer: deepExtendState
                // })
                ),
            // DevTools.instrument()
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

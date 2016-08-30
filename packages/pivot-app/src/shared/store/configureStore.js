import createLogger from 'redux-logger';
import rootReducer from '../reducers/';
import { compose, createStore, applyMiddleware } from 'redux';
import { createFragmentMiddleware } from 'reaxtor-redux';

export function configureStore(initialState = {}) {
    return createStore(rootReducer, initialState, compose(
            applyMiddleware(createLogger())
            //DevTools.instrument()
        )
    );
}

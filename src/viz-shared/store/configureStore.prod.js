import rootReducer from '../reducers';
import { createStore, applyMiddleware } from 'redux';
import toolbar from '../reducers/toolbar';
import settings from '../reducers/settings';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState) {
    return createStore(rootReducer, initialState, applyMiddleware(
        createEpicMiddleware(
            combineEpics(toolbar, settings)
        )
    ));
}

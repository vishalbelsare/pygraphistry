import { createStore, applyMiddleware } from 'redux';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState, rootReducer, epics) {
    return createStore(rootReducer, initialState, applyMiddleware(
        createEpicMiddleware(
            combineEpics(...epics)
        )
    ));
}

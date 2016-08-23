import rootReducer from '../reducers';
import { createStore, applyMiddleware } from 'redux';
import toolbar from '../reducers/toolbar';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState) {
    return createStore(rootReducer, initialState, applyMiddleware(
        createEpicMiddleware(
            combineEpics(toolbar)
        )
    ));
    // const fragmentMiddleware = createFragmentMiddleware(rootModel, rootFragment);
    // const store = createStore(rootReducer, {}, applyMiddleware(fragmentMiddleware));
    // return store;
}

import rootReducer from '../reducers';
import { createStore, applyMiddleware } from 'redux';

import toolbarEpic from '../toolbar/epics';
import settingsEpic from '../settings/epics';

import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState) {
    return createStore(rootReducer, initialState, applyMiddleware(
        createEpicMiddleware(
            combineEpics(toolbarEpic, settingsEpic)
        )
    ));
    // const fragmentMiddleware = createFragmentMiddleware(rootModel, rootFragment);
    // const store = createStore(rootReducer, {}, applyMiddleware(fragmentMiddleware));
    // return store;
}

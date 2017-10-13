import { createStore, applyMiddleware } from 'redux';
import { createEpicMiddleware, combineEpics } from 'redux-observable';

export function configureStore(initialState) {
    let { default: rootReducer, ...epics } = require('../reducers'); // eslint-disable-line global-require
    const epicMiddleware = createEpicMiddleware(
        combineEpics(...Object.keys(epics).map(x => epics[x]))
    );

    // Hot reload the Falcor Routes
    if (module.hot) {
        module.hot.accept('../reducers', () => {
            let { default: rootReducer, ...epics } = require('../reducers'); // eslint-disable-line global-require
            epicMiddleware.replaceEpic(combineEpics(...Object.keys(epics).map(x => epics[x])));
        });
    }

    return createStore(rootReducer, initialState, applyMiddleware(epicMiddleware));
}

import rootReducer from '../reducers/';
import { DevTools } from 'pivot-shared/main/components/DevTools';
import { compose, createStore, applyMiddleware } from 'redux';
import { app } from '../reducers/app';
import { investigationScreen } from '../reducers/investigationScreen';
import { investigation } from '../reducers/investigation';
import { connectorScreen } from '../reducers/connectorScreen';
import { pivot } from '../reducers/pivotRow';
import { createEpicMiddleware, combineEpics } from 'redux-observable';
import { createLogger as ReduxLogger } from 'redux-logger';

export function configureStore() {
    const epicsMiddleware = createEpicMiddleware(
        combineEpics(app, investigationScreen, connectorScreen, investigation, pivot)
    );

    const enhancer = __DEV__
        ? compose(
              applyMiddleware(epicsMiddleware, ReduxLogger({ collapsed: true })),
              DevTools.instrument()
          )
        : applyMiddleware(epicsMiddleware);

    return createStore(rootReducer, undefined, enhancer);
}

import rootReducer from '../reducers/';
import { DevTools } from '../containers';
import { compose, createStore, applyMiddleware } from 'redux';
import { createFragmentMiddleware } from '@graphistry/falcor-react-redux';
import { app } from '../reducers/app';
import { investigationScreen } from '../reducers/investigationScreen';
import { investigation } from '../reducers/investigation';
import { connectorScreen } from '../reducers/connectorScreen';
import { pivot } from '../reducers/pivotRow';
import { createEpicMiddleware, combineEpics } from 'redux-observable';


export function configureStore(initialState = {}) {
    const epicsMiddleware = createEpicMiddleware(
        combineEpics(app, investigationScreen, connectorScreen, investigation, pivot)
    );

    const enhancer = __DEV__ ?
        compose(
            applyMiddleware(epicsMiddleware, require('redux-logger')()),
            DevTools.instrument()
        ) :
        applyMiddleware(epicsMiddleware);

    return createStore(
        rootReducer,
        initialState,
        enhancer,
	)
}

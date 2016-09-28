import createLogger from 'redux-logger';
import rootReducer from '../reducers/';
import { DevTools } from '../containers';
import { compose, createStore, applyMiddleware } from 'redux';
import { createFragmentMiddleware } from '@graphistry/falcor-react-redux';
import { app } from '../reducers/investigationList';
import { investigation } from '../reducers/investigation';
import { pivot } from '../reducers/pivotRow';
import { createEpicMiddleware, combineEpics } from 'redux-observable';


export function configureStore(initialState = {}) {
     return createStore(rootReducer, initialState, compose(
        applyMiddleware(createEpicMiddleware(
            combineEpics(investigation, app, pivot)
        ), createLogger()),
        DevTools.instrument()
	    )
	)
}

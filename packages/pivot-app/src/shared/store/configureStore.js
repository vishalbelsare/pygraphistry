import createLogger from 'redux-logger';
import rootReducer from '../reducers/';
import { DevTools } from '../containers';
import { compose, createStore, applyMiddleware } from 'redux';
import { createFragmentMiddleware } from 'reaxtor-redux';
import investigations from '../reducers/investigationList'
import pivots from '../reducers/pivotRow';
import { createEpicMiddleware, combineEpics } from 'redux-observable';



export function configureStore(initialState = {}) {
     return createStore(rootReducer, initialState, compose(
        applyMiddleware(createEpicMiddleware(
            combineEpics(investigations, pivots)
        ), createLogger()),
        DevTools.instrument()
	    )
	)
}

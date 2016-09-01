import createLogger from 'redux-logger';
import rootReducer from '../reducers/';
import { DevTools } from '../containers';
import { compose, createStore, applyMiddleware } from 'redux';
import { createFragmentMiddleware } from 'reaxtor-redux';
import setInvestigationName from '../reducers/investigationList'
import { createEpicMiddleware, combineEpics } from 'redux-observable';



export function configureStore(initialState = {}) {
     return createStore(rootReducer, initialState, compose(
        applyMiddleware(createEpicMiddleware(
            setInvestigationName
        ), createLogger()),
        DevTools.instrument()
	    )
	)
}

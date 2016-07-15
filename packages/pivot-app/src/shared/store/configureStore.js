import createLogger from 'redux-logger';
import rootReducer from '../reducers/';
import { DevTools } from '../containers';
import { compose, createStore, applyMiddleware } from 'redux';
import { createFragmentMiddleware } from '@graphistry/falcor-react-redux';
import investigationList from '../reducers/investigationList';
import { investigation } from '../reducers/investigation';
import { pivot } from '../reducers/pivotRow';
import { createEpicMiddleware, combineEpics } from 'redux-observable';


console.log('Pivots in store', pivot)

export function configureStore(initialState = {}) {
     return createStore(rootReducer, initialState, compose(
        applyMiddleware(createEpicMiddleware(
            combineEpics(investigation, investigationList, pivot)
        ), createLogger()),
        DevTools.instrument()
	    )
	)
}

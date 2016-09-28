import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';
import { combineEpics } from 'redux-observable';
import { Observable } from 'rxjs';
import {
    SELECT_INVESTIGATION,
    CREATE_INVESTIGATION,
    SET_INVESTIGATION_NAME,
    SAVE_INVESTIGATION,
    COPY_INVESTIGATION
} from '../actions/app';


export const app = combineEpics(createInvestigation, selectInvestigation, setInvestigationName,
                                saveInvestigation, copyInvestigation);

function createInvestigation(action$, store) {
    return action$
        .ofType(CREATE_INVESTIGATION)
        .mergeMap(({falcor}) => falcor.call('createInvestigation'))
        .ignoreElements();
}

function selectInvestigation(action$, store) {
        return action$
            .ofType(SELECT_INVESTIGATION)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ falcor, id }) => falcor.set(
                    $value(`selectedInvestigation`, $ref(`investigationsById['${id}']`))
                )
                .progressively()
            ))
            .ignoreElements();
}

function setInvestigationName(action$, store) {
    return action$
        .ofType(SET_INVESTIGATION_NAME)
        .mergeMap(({ falcor, name}) =>
            falcor.set($value('selectedInvestigation.name', name)).progressively()
        )
        .ignoreElements();
}

function saveInvestigation(action$, store) {
    return action$
        .ofType(SAVE_INVESTIGATION)
        .mergeMap(({falcor, id}) =>
            Observable.from(falcor.call(['investigationsById', id, 'save']))
        )
        .ignoreElements();
}

function copyInvestigation(action$, store) {
    return action$
        .ofType(COPY_INVESTIGATION)
        .do(a => console.log('copypy',a.id))
        .ignoreElements();
}

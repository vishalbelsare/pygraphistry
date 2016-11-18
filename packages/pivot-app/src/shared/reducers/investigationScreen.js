import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';
import { combineEpics } from 'redux-observable';
import { Observable } from 'rxjs';
import _ from 'underscore';
import {
    SELECT_INVESTIGATION,
    CREATE_INVESTIGATION,
    SET_INVESTIGATION_PARAMS,
    SAVE_INVESTIGATION,
    COPY_INVESTIGATION,
    DELETE_INVESTIGATIONS
} from '../actions/investigationScreen.js';


export const investigationScreen = combineEpics(
    createInvestigation, selectInvestigation, setInvestigationParams,
    saveInvestigation, copyInvestigation, deleteInvestigations
);

function createInvestigation(action$, store) {
    return action$
        .ofType(CREATE_INVESTIGATION)
        .mergeMap(({falcor, userId}) => falcor.call(['usersById', userId, 'createInvestigation']))
        .ignoreElements();
}

function selectInvestigation(action$, store) {
        return action$
            .ofType(SELECT_INVESTIGATION)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ falcor, id }) => falcor.set(
                    $value(`currentUser.activeInvestigation`, $ref(`investigationsById['${id}']`))
                )
                .progressively()
            ))
            .ignoreElements();
}

function setInvestigationParams(action$, store) {
    return action$
        .ofType(SET_INVESTIGATION_PARAMS)
        .mergeMap(({falcor, params, id}) => {
            const root = id ? ['investigationsById', id] : ['currentUser', 'activeInvestigation']
            return Observable.from(
                _.map(params, (value, key) =>
                    falcor.set($value(root.concat([key]), value))
                )
            ).mergeAll()
        })
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
        .mergeMap(({falcor, id}) =>
            Observable.from(falcor.call(['investigationsById', id, 'clone']))
        )
        .ignoreElements();
}

function deleteInvestigations(action$, store) {
    return action$
        .ofType(DELETE_INVESTIGATIONS)
        .mergeMap(({falcor, userId, investigationIds}) =>
            Observable.from(
                falcor.call(['usersById', userId, 'removeInvestigations'], [investigationIds])
            )
        )
        .ignoreElements();
}

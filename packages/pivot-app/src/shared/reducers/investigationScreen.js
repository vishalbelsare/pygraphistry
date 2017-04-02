import { $ref, $value } from '@graphistry/falcor-json-graph';
import { combineEpics } from 'redux-observable';
import { Observable } from 'rxjs';
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
    saveInvestigation, cloneInvestigation, deleteInvestigations
);

function createInvestigation(action$) {
    return action$
        .ofType(CREATE_INVESTIGATION)
        .mergeMap(({falcor}) => falcor.call('createInvestigation', []))
        .ignoreElements();
}

function cloneInvestigation(action$) {
    return action$
        .ofType(COPY_INVESTIGATION)
        .mergeMap(({falcor, id}) => falcor.call('cloneInvestigations', [id]))
        .ignoreElements();
}

function deleteInvestigations(action$) {
    return action$
        .ofType(DELETE_INVESTIGATIONS)
        .mergeMap(({falcor, investigationIds}) => falcor.call('removeInvestigations', [investigationIds]))
        .ignoreElements();
}

function selectInvestigation(action$) {
    return action$
        .ofType(SELECT_INVESTIGATION)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ falcor, id }) => falcor.set({
                json: {
                    currentUser: {
                        activeInvestigation: $ref(`investigationsById['${id}']`)
                    }
                }
            })
            .progressively()
        ))
        .ignoreElements();
}

function setInvestigationParams(action$) {
    return action$
        .ofType(SET_INVESTIGATION_PARAMS)
        .switchMap(({ falcor, params, id }) => {
            const topLevelModel = falcor._root.topLevelModel;
            return Observable.from(topLevelModel.set(...Object.keys(params).map((key) => $value(
                `investigationsById['${id}']['${key}']`, params[key]
            ))));
        }
        )
        .ignoreElements();
}

function saveInvestigation(action$) {
    return action$
        .ofType(SAVE_INVESTIGATION)
        .mergeMap(({falcor, id}) => {
            const topLevelModel = falcor._root.topLevelModel;
            return Observable.from(topLevelModel.call(['investigationsById', [id], 'save']))
        })
        .ignoreElements();
}

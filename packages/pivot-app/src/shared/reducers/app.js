import { pathValue as $value } from '@graphistry/falcor-json-graph';
import { combineEpics } from 'redux-observable';
import { SWITCH_SCREEN } from '../actions/app.js';

export const app = combineEpics(switchScreen);

function switchScreen(action$) {
    return action$
        .ofType(SWITCH_SCREEN)
        .mergeMap(({ falcor, screen }) =>
            falcor.set($value(`currentUser.activeScreen`, screen)).progressively()
        )
        .ignoreElements();
}

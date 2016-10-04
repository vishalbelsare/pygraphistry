import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';
import { combineEpics } from 'redux-observable';
import { Observable } from 'rxjs';
import {
    SWITCH_SCREEN
} from '../actions/app.js';


export const app = combineEpics(switchScreen);

function switchScreen(action$, store) {
    return action$
        .ofType(SWITCH_SCREEN)
        .mergeMap(({falcor, screen}) =>
            falcor.set(
                $value(`currentUser.activeScreen`, screen)
            ).progressively()
        ).ignoreElements();
}

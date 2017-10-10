import {
  ref as $ref,
  atom as $atom,
  pathValue as $value,
  pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable, Scheduler } from 'rxjs';
import { SET_CONTROL_VALUE } from 'viz-app/actions/settings';

export function settings(action$, store) {
  return setControlValue(action$, store);
}

function setControlValue(action$, store) {
  return action$
    .ofType(SET_CONTROL_VALUE)
    .groupBy(({ id }) => id)
    .mergeMap(actionsById =>
      actionsById
        .auditTime(0, Scheduler.animationFrame)
        .switchMap(({ falcor, value }) => falcor.set($value(['value', null], value)))
    )
    .ignoreElements();
}

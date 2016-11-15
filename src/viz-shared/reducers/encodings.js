import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable, Scheduler } from 'rxjs';
import {
    SET_ENCODING,
} from 'viz-shared/actions/encodings';

export function setEncoding (action$, store) {
    return action$
        .ofType(SET_ENCODING)
        .groupBy(({id}) => id)
        .do((...args) => {
            console.log('Got set encoding reducer, args: ', args);
        })
        .mergeMap((idGroup) => idGroup.exhaustMap(
            ({falcor, ...args}) =>
                // TODO PAUL: Make sure this hits the right path
                falcor.call('set', [args])
        ))
        .ignoreElements();
}
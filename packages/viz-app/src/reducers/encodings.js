import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable, Scheduler } from 'rxjs';
import {
    SET_ENCODING,
} from 'viz-app/actions/encodings';

export function setEncoding (action$, store) {
    return action$
        .ofType(SET_ENCODING)
        .groupBy(({id}) => id)
        .mergeMap((idGroup) => idGroup.exhaustMap(
            ({falcor, graphType, encodingType, ...args}) =>
                falcor.set($value(
                    `encodings.${graphType}.${encodingType}`,
                    $atom({graphType, encodingType, ...args})))))
        .ignoreElements();
}

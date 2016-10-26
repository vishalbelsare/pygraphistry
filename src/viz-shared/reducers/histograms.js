import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable, Scheduler } from 'rxjs';
import {
    ADD_HISTOGRAM,
    REMOVE_HISTOGRAM,
    UPDATE_HISTOGRAM,
    HIGHLIGHT_HISTOGRAM,
    CANCEL_HIGHLIGHT_HISTOGRAM
} from 'viz-shared/actions/histograms';

export function histograms(action$, store) {
    return highlightHistogram(action$, store);
}

function highlightHistogram(action$, store) {
    return action$
        .ofType(HIGHLIGHT_HISTOGRAM)
        .groupBy(({ binKey }) => binKey)
        .mergeMap((actionsById) => actionsById
            .auditTime(0, Scheduler.animationFrame)
            .switchMap(({ falcor, min, max, equals }) => falcor
                .call('computeMask', [min, max, equals])
            )
            .takeUntil(action$
                .ofType(CANCEL_HIGHLIGHT_HISTOGRAM)
                .filter(({ binKey }) => group.key === binKey))
        )
        .ignoreElements();
}

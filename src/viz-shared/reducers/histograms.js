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

    BIN_TOUCH_MOVE,
    BIN_TOUCH_START,
    BIN_TOUCH_CANCEL,

    BIN_YSCALE_CHANGED,
    BIN_ENCODING_CHANGED,
} from 'viz-shared/actions/histograms';

export function histograms(action$, store) {
    return Observable.merge(
        addHistogram(action$, store),
        updateHistogram(action$, store),
        removeHistogram(action$, store),
        highlightHistogramBin(action$, store)
    ).ignoreElements();
}

function addHistogram(action$) {
    return action$
        .ofType(ADD_HISTOGRAM)
        .mergeMap(({ name, dataType, componentType, falcor }) => (
            falcor.call('add', [componentType, name, dataType])
        ));
}

function updateHistogram(action$) {
    return action$
        .ofType(BIN_YSCALE_CHANGED, BIN_ENCODING_CHANGED)
        .switchMap(({ falcor, key, value }) => (
            falcor.set($value(key, value))
        ));
}

function removeHistogram(action$) {
    return action$
        .ofType(REMOVE_HISTOGRAM)
        .mergeMap(({ id, falcor }) => (
            falcor.call('remove', [id])
        ));
}

function highlightHistogramBin(action$) {
    return action$
        .ofType(BIN_TOUCH_MOVE)
        .filter(({ event }) => event.buttons === 0)
        .distinctUntilChanged(null, ({ index }) => index)
        .switchMap(({ index, falcor }) => (
            falcor.call('highlightBin', [index])
        ))
}

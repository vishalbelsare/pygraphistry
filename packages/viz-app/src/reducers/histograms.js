import { range as _range } from 'lodash';
import { Observable } from 'rxjs/Observable';
import * as Scheduler from 'rxjs/scheduler/animationFrame';
import { createSubject, SceneGestures } from './support';
import { $ref, $atom, $value, $invalidate } from '@graphistry/falcor-json-graph';
import {
    ADD_HISTOGRAM,
    CLEAR_HIGHLIGHT,
    REMOVE_HISTOGRAM,

    BIN_TOUCH_MOVE,
    BIN_TOUCH_START,
    BIN_TOUCH_CANCEL,

    BIN_YSCALE_CHANGED,
    BIN_ENCODING_CHANGED,
} from 'viz-app/actions/histograms';

export function histograms(action$, store) {
    return Observable.merge(
        addHistogram(action$, store),
        updateHistogram(action$, store),
        removeHistogram(action$, store),
        filterBinsOnDrag(action$, store),
        highlightHistogramBin(action$, store),
        clearHistogramHighlight(action$, store)
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
        .distinctUntilChanged(null, ({ binID }) => binID)
        .takeUntil(action$.ofType(CLEAR_HIGHLIGHT)).repeat()
        .switchMap(({ binID, falcor }) => (
            falcor.call('highlightBin', [binID])
        ));
}

function clearHistogramHighlight(action$) {
    return action$
        .ofType(CLEAR_HIGHLIGHT)
        .filter(({ event }) => event.buttons === 0)
        .switchMap(({ falcor, componentType }) => {
            const viewModel = falcor._clone({
                _path: falcor.getPath().slice(0, 4)
            });
            return viewModel.set({ json: {
                labels: { highlight: $atom(undefined) },
                highlight: {
                    darken: false,
                    [componentType]: $atom([])
                }
            }})
        });
}

function filterBinsOnDrag(actions) {

    const filterBinsEnds = SceneGestures.end();
    const filterBinsCancels = SceneGestures.cancel();

    const filterBinsMoves = SceneGestures
        .moveFromActions(actions
            .ofType(BIN_TOUCH_MOVE));

    const filterBinsStartsById = SceneGestures
        .startsByIdFromActions(
            actions.ofType(BIN_TOUCH_START));

    const brushPans = filterBinsStartsById
        .take(1)
        .mergeMap((filterBinsStarts) => SceneGestures
            .pan(filterBinsStarts,
                 filterBinsMoves,
                 filterBinsEnds,
                 filterBinsCancels)
            .distinctUntilChanged(null, selectBinID)
            .map(selectBinIDAndAnchor)
            .scan(scanBinIDsAndAnchor)
            .multicast(createSubject, multicastBrushPans)
        );

    return brushPans.repeat().switch();

    function selectBinID({ binID }) { return binID; }
    function selectBinIDAndAnchor({ binID, range_, falcor, binIsFiltered }) {
        return [binID, binID, falcor, range_, binIsFiltered];
    }

    function scanBinIDsAndAnchor(memo, [binID, x, falcor, range_, binIsFiltered]) {
        const [anchor, cursor] = memo;
        memo[1] = binID;
        memo[0] = binID > cursor ? anchor :
                  binID < cursor ? anchor :
                  cursor;
        return memo;
    }

    function multicastBrushPans(drags) {
        return drags
            .auditTime(0, Scheduler.animationFrame)
            .map(toLocalFilterValues)
            .merge(drags
                .takeLast(1)
                .map(toRemoteFilterCall))
    }

    function toLocalFilterValues([
        anchor, cursor, falcor, range_, binIsFiltered, range = _range(
            Math.min(anchor, cursor), Math.max(anchor, cursor) + 1)]) {
        return falcor.withoutDataSource().set(
            $value('range', range),
            $value('filter.enabled', true)
        );
    }

    function toRemoteFilterCall([
        anchor, cursor, falcor, range_, binIsFiltered]) {

        let range = [];

        if (anchor === cursor) {
            if (!binIsFiltered) {
                range = [anchor];
            }
        } else {
            range = _range(
                Math.min(anchor, cursor),
                Math.max(anchor, cursor) + 1);
        }

        return Observable.merge(
            falcor.call('filter', range),
            falcor.withoutDataSource().set(
                $value('range', range),
                $value('filter.enabled', true)
            )
        );
    }
}

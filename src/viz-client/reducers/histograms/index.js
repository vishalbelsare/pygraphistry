import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import _ from 'lodash';
import { Observable } from 'rxjs/Observable';
import { BIN_TOUCH_START, BIN_TOUCH_MOVE } from 'viz-shared/actions/histograms';
import { tapDelay, tapRadius, createSubject, SceneGestures } from 'viz-client/reducers/support';

export function filterHistograms(actions, state) {

    return Observable.merge(
        filterBinOnTap(actions),
        filterBinsOnDrag(actions)
    )
    .switch()
    .ignoreElements();
}

function filterBinOnTap(actions) {

    const histogramBinStarts = SceneGestures
        .startFromActions(actions
            .ofType(BIN_TOUCH_START)
        );

    const histogramBinTaps = SceneGestures
        .tap(histogramBinStarts, { delay: tapDelay })
        .repeat()
        .mergeAll();

    return histogramBinTaps.map(({
        falcor, binID, binIsFiltered,
        range = binIsFiltered ? [] : [binID]
    }) => Observable.merge(
        falcor.call('filter', range),
        falcor.withoutDataSource().set(
            $value('filter.range', range),
            $value('filter.enabled', true)
        )
    ));
}

function filterBinsOnDrag(actions) {

    const filterBinsStarts = SceneGestures
        .startFromActions(actions
            .ofType(BIN_TOUCH_START)
        );

    const filterBinsMoves = SceneGestures
        .startFromActions(actions
            .ofType(BIN_TOUCH_MOVE)
        );

    const brushFilterBins = SceneGestures
        .pan(filterBinsStarts,
            { delay: tapDelay, radius: tapRadius },
            filterBinsMoves,
            SceneGestures.end(),
            SceneGestures.cancel()
        )
        .distinctUntilChanged(null, ({ binID }) => binID)
        .map(({ falcor, binID }) => [binID, binID, falcor])
        .scan(([anchor, cursor], [binID, x, falcor]) => [
            binID > cursor ? anchor :
            binID < cursor ? anchor :
            cursor, binID, falcor
        ]);

    return brushFilterBins.multicast(
        createSubject,
        (drags) => Observable.merge(

            drags
                .auditTime(10)
                .map(([anchor, cursor, falcor, range = _.range(
                    Math.min(anchor, cursor), Math.max(anchor, cursor) + 1
                )]) => (
                falcor.withoutDataSource().set(
                    $value('filter.range', range),
                    $value('filter.enabled', true)
                )
            )),

            drags
                .takeLast(1)
                .map(([anchor, cursor, falcor, range = anchor === cursor ? [] : _.range(
                    Math.min(anchor, cursor), Math.max(anchor, cursor) + 1
                )]) => Observable.merge(
                    falcor.call('filter', range),
                    falcor.withoutDataSource().set(
                        $value('filter.range', range),
                        $value('filter.enabled', true)
                    )
                ))
        ))
        .repeat();
}

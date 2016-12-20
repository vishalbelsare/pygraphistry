import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import _ from 'lodash';
import { Observable } from 'rxjs/Observable';
import { createSubject, SceneGestures } from 'viz-client/reducers/support';
import { BIN_TOUCH_START, BIN_TOUCH_MOVE } from 'viz-shared/actions/histograms';
import { animationFrame as AnimationFrameScheduler } from 'rxjs/scheduler/animationFrame';

export function filterHistograms(actions, state) {
    return filterBinsOnDrag(actions).ignoreElements();
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
    function selectBinIDAndAnchor({ binID, range, falcor, binIsFiltered }) {
        return [binID, binID, falcor, range, binIsFiltered];
    }

    function scanBinIDsAndAnchor(memo, [binID, x, falcor, range, binIsFiltered]) {
        const [anchor, cursor] = memo;
        memo[1] = binID;
        memo[0] = binID > cursor ? anchor :
                  binID < cursor ? anchor :
                  cursor;
        return memo;
    }

    function multicastBrushPans(drags) {
        return drags
            .auditTime(0, AnimationFrameScheduler)
            .map(toLocalFilterValues)
            .merge(drags
                .takeLast(1)
                .map(toRemoteFilterCall))
    }

    function toLocalFilterValues([
        anchor, cursor, falcor, range, binIsFiltered, _range = _.range(
            Math.min(anchor, cursor), Math.max(anchor, cursor) + 1)]) {
        return falcor.withoutDataSource().set(
            $value('range', _range),
            $value('filter.enabled', true)
        );
    }

    function toRemoteFilterCall([
        anchor, cursor, falcor, range, binIsFiltered]) {

        let _range = [];

        if (anchor === cursor) {
            if (!binIsFiltered) {
                _range = [anchor];
            }
        } else {
            _range = _.range(
                Math.min(anchor, cursor),
                Math.max(anchor, cursor) + 1);
        }

        return Observable.merge(
            falcor.call('filter', _range),
            falcor.withoutDataSource().set(
                $value('range', _range),
                $value('filter.enabled', true)
            )
        );
    }
}

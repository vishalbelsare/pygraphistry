import { Observable } from 'rxjs/Observable';
import { pickPointsOfInterest } from './pickPointsOfInterest';
import { resetHighlightedLabel } from './resetHighlightedLabel';
import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function labels(action$) {
    return Observable.merge(
        pickPointsOfInterest(action$).switchMap(commitReducerResults),
        resetHighlightedLabel(action$).switchMap(commitReducerResults),
    )
    .ignoreElements();
}

function commitReducerResults({ falcor, values, invalidations }) {
    if (falcor) {
        if (invalidations && invalidations.length) {
            falcor.invalidate(...invalidations);
        }
        if (values && values.length) {
            return falcor.set(...values);
        }
    }
    return Observable.never();
}

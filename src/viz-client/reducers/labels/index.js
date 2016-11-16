import { Observable } from 'rxjs/Observable';
import { pickPointsOfInterest } from './pickPointsOfInterest';
import { resetHighlightedLabel } from './resetHighlightedLabel';

export function labels(action$) {
    return Observable.merge(
        pickPointsOfInterest(action$),
        resetHighlightedLabel(action$),
    )
    .switchMap(({ falcor, values, invalidations }) => {
        if (falcor) {
            if (invalidations && invalidations.length) {
                falcor.invalidate(...invalidations);
            }
            if (values && values.length) {
                return falcor.set(...values);
            }
        }
        return Observable.never();
    })
    .ignoreElements();
}

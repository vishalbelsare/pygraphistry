import { Gestures } from 'rxjs-gestures';
import { Observable } from 'rxjs/Observable';
import { LABEL_MOUSE_WHEEL } from 'viz-shared/actions/labels';
import { pickPointsOfInterest } from './pickPointsOfInterest';

export function labels(action$) {
    return Observable.merge(
        pickPointsOfInterest(action$),
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

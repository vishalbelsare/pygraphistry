import { Observable } from 'rxjs/Observable';
import { pickPointsOfInterest } from './pickPointsOfInterest';
import { resetHighlightedLabel } from './resetHighlightedLabel';
import {
    ADD_LABEL_FILTER,
    ADD_LABEL_EXCLUSION,
} from 'viz-shared/actions/labels';
import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function labels(action$) {
    return Observable.merge(
        addFilter(action$),
        addExclusion(action$),
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

function addFilter(action$) {
    return action$
        .ofType(ADD_LABEL_FILTER)
        .exhaustMap(({ name, value, dataType, componentType, falcor }) => {
            return falcor.call('filters.add', [componentType, name, dataType, value]);
        });
}

function addExclusion(action$) {
    return action$
        .ofType(ADD_LABEL_EXCLUSION)
        .exhaustMap(({ name, value, dataType, componentType, falcor }) => {
            const viewModel = falcor._clone({
                _path: falcor.getPath().slice(0, -3)
            });
            return Observable.merge(
                falcor.call('exclusions.add', [componentType, name, dataType, value]),
                viewModel.set({ json: {
                    highlight: {
                        darken: false,
                        edge: $atom([]),
                        point: $atom([]),
                    },
                    selection: {
                        edge: $atom([]),
                        point: $atom([]),
                    },
                    labels: {
                        highlight: $atom(undefined),
                        selection: $atom(undefined),
                    }
                }})
            );
        });
}

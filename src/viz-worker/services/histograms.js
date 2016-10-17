import { Observable } from 'rxjs';
import { maskDataframe } from './dataframe';
import Binning from 'viz-worker/simulator/Binning';
import {
    histogram as createHistogram
} from 'viz-shared/models/expressions';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

export function addHistogram(loadViewsById) {
    return function addHistogram({ workbookIds, viewIds, type, attribute }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .map(({ workbook, view }) => {
            const { histogramsById } = view;
            const histogram = createHistogram(type, attribute);
            histogramsById[histogram.id] = histogram;
            return { workbook, view, histogram };
        });
    }
}

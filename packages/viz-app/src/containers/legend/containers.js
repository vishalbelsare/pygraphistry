import { container } from '@graphistry/falcor-react-redux';
import { Histogram } from '../histograms';

export const withLegendContainer = container({
    // fragment: Histogram.fragment
    fragment: (legend = {}) => `{
        visible
    }`
});

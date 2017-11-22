import { container } from '@graphistry/falcor-react-redux';
import { Histogram } from '../histograms';

export const withTimebarContainer = container({
        fragment: Histogram.fragment
        // (timebar = {}) => `{
        //   timebarHistogram: ${Histogram.fragment(timebar.timebarHistogram)}
        // }`
    });
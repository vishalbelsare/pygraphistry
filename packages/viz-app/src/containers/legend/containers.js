import { container } from '@graphistry/falcor-react-redux';
import { Histogram } from '../histograms';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';

export const withLegendContainer = container({
    // fragment: Histogram.fragment
    fragment: (legend = {}) => `{
            visible, activeTab
        }`,
    mapFragment(data, props, $falcor) {
        return { ...data, $falcor };
    }
});

export const legendTabInteractions = mapPropsStream(propStream => {
    const { stream: selectedTabs, handler: onTabSelected } = createEventHandler();
    return propStream
        .switchMap(({ $falcor, ...props }) =>
            selectedTabs
                .switchMap(
                    activeTab => $falcor.set({ json: { activeTab } }).toPromise(),
                    (activeTab, { json }) => ({ ...props, ...json })
                )
                .startWith(props)
        )
        .map(props => ({ ...props, onTabSelected }));
});

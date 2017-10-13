import { container } from '@graphistry/falcor-react-redux';
import styles from 'viz-app/components/histograms/styles.less';
import { HistogramsList } from 'viz-app/components/expressions';
import { Sparkline, SparklineBar } from 'viz-app/components/histograms';

import {
    binTouchMove,
    binTouchStart,
    binTouchCancel,
    yScaleChanged,
    addHistogram,
    clearHighlight,
    removeHistogram
} from 'viz-app/actions/histograms';

import { setEncoding } from 'viz-app/actions/encodings';

let Histograms = ({
    addHistogram,
    removeHistogram,
    setEncoding,
    encodings,
    templates = [],
    histograms = [],
    loading = false,
    className = '',
    style = {},
    ...props
}) => {
    let showLoadingInHeader = false;

    const histogramItems = Array.from(histograms, (histogram, index) => {
        let style;
        if (!histogram) {
            showLoadingInHeader = loading;
            style = { borderBottomStyle: 'dashed' };
            histogram = { id: 'pending', componentType: '' };
        }
        return (
            <Histogram
                style={style}
                data={histogram}
                setEncoding={setEncoding}
                encodings={{ ...encodings }}
                key={`${index}: ${histogram.id}`}
                removeHistogram={removeHistogram}
            />
        );
    });

    return (
        <HistogramsList
            showHeader={false}
            showDataTypes={false}
            dropdownPlacement="top"
            addExpression={addHistogram}
            loading={showLoadingInHeader}
            placeholder="Add histogram for..."
            style={{ ...style, height: `100%` }}
            {...props}
            className={className + ' ' + styles['histograms-list']}
            templates={templates.filter(({ isInternal }) => !isInternal)}>
            {histogramItems}
        </HistogramsList>
    );
};

Histograms = container({
    renderLoading: true,
    fragment: ({ templates = [], encodings, ...histograms } = {}) => {
        return `{
            templates: {
                length, [0...${templates.length}]: {
                    name, isPrivate, isInternal, dataType, identifier, componentType
                }
            },
            id, name, length, ...${Histogram.fragments(histograms)},
            encodings: {
                options: {
                    ['point', 'edge']: { color }
                },
                point: { color, size, icon },
                edge: { color, icon }
            }
        }`;
    },
    mapFragment: histograms => ({
        histograms,
        id: histograms.id,
        name: histograms.name,
        templates: histograms.templates,
        encodings: histograms.encodings
    }),
    dispatchers: {
        addHistogram,
        removeHistogram,
        setEncoding
    }
})(Histograms);

let Histogram = ({
    range = [],
    loading = false,
    dataType,
    componentType,
    id,
    name,
    yScale = 'none',
    encodings,
    filter,
    global: _global = {},
    masked = {},
    removeHistogram,
    yScaleChanged,
    setEncoding,
    clearHighlight,
    binTouchMove,
    binTouchStart,
    binTouchCancel
}) => {
    const { [componentType]: encodingDescription = {} } = encodings || {};
    const {
        color: { legend: colors = [], attribute: encodedAttribute } = {}
    } = encodingDescription;

    range = (filter && range) || [];
    const trans = Math[yScale] || (x => x);
    const enabled = !filter || filter.enabled;
    const filtered = range && range.length > 0;
    const isEncoded = encodings && name === encodedAttribute;
    const { bins: maskedBins = [], isMasked } = masked;
    const { bins: globalBins = [], numBins = 1, maxElements = 1, binType = 'nodata' } = _global;

    return (
        <Sparkline
            id={id}
            name={name}
            yScale={yScale}
            loading={loading}
            filtered={filtered}
            dataType={dataType}
            encodings={encodings}
            onClose={removeHistogram}
            setEncoding={setEncoding}
            isFilterEnabled={enabled}
            componentType={componentType}
            onYScaleChanged={value => yScaleChanged({ key: 'yScale', value })}
            onClearHighlight={event => clearHighlight({ id, event, componentType })}>
            {globalBins.map(
                (
                    { values, count: globalCount },
                    binID,
                    bins,
                    binIsFiltered = filtered &&
                        !!(
                            (binID >= range[0] && binID <= range[range.length - 1]) ||
                            ~range.indexOf(binID)
                        ),
                    { count: maskedCount = 0 } = maskedBins[binID] || {}
                ) => (
                    <SparklineBar
                        index={binID}
                        filtered={binIsFiltered}
                        key={`${id}-bar-${binID}`}
                        name={name}
                        values={values}
                        componentType={componentType}
                        color={isEncoded && colors[binID]}
                        binWidth={`${100 * (1 / (numBins || 1))}%`}
                        filterBounds={{
                            leftest: binIsFiltered && binID <= range[0],
                            rightest: binIsFiltered && binID >= range[range.length - 1]
                        }}
                        globalCount={globalCount}
                        maskedCount={maskedCount}
                        binType={binType}
                        dataType={dataType}
                        isMasked={isMasked}
                        onBinTouchMove={event =>
                            binTouchMove({ event, binID, range, binIsFiltered })}
                        onBinTouchStart={event =>
                            binTouchStart({ event, binID, range, binIsFiltered })}
                        onBinTouchCancel={event =>
                            binTouchCancel({ event, binID, range, binIsFiltered })}
                        maskedHeight={`${100 *
                            (trans(maskedCount || 0) / (trans(maxElements) || 1))}%`}
                        globalHeight={`${100 *
                            (trans(globalCount || 0) / (trans(maxElements) || 1))}%`}
                    />
                )
            )}
        </Sparkline>
    );
};

Histogram = container({
    renderLoading: true,
    fragment: ({ global, masked } = {}) => `{
        filter: { enabled },
        id, name, range, yScale, dataType, componentType,
        global: ${HistogramBins.fragment(global)} ${global
        ? `,
        masked: ${HistogramBins.fragment(masked)}`
        : ''}
    }`,
    dispatchers: {
        binTouchMove,
        binTouchStart,
        binTouchCancel,
        clearHighlight,
        yScaleChanged
    }
})(Histogram);

let HistogramBins = container({
    renderLoading: true,
    fragment: ({ bins } = {}) => `{
        id, name, yScale,
        filter: { enabled },
        numElements, maxElements,
        binType, binWidth, numBins,
        isMasked, dataType, componentType,
        bins: ${HistogramBin.fragments(bins)}
    }`
})(() => {});

let HistogramBin = container({
    renderLoading: true,
    fragment: (bins = []) => `{
        count, values, exclude
    }`
})(() => {});

export { Histograms, Histogram };

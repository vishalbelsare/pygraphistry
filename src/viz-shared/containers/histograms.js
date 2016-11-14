import React from 'react'
import { container } from '@graphistry/falcor-react-redux';
import { ExpressionsList } from 'viz-shared/components/expressions';
import { Sparkline, SparklineBar } from 'viz-shared/components/histograms';
import styles from 'viz-shared/components/histograms/styles.less';

import {

    binTouchMove,
    binTouchStart,
    binTouchCancel,
    yScaleChanged,

    addHistogram,
    removeHistogram,
} from 'viz-shared/actions/histograms';

import {
    setEncoding,
    resetEncoding
} from 'viz-shared/actions/encodings';

let Histograms = ({ addHistogram, removeHistogram, encodings,
                    templates = [], histograms = [],
                    loading = false, className = '',
                    style = {}, ...props }) => {

    console.log('got encodings:', encodings);

    return (
        <ExpressionsList loading={loading}
                         templates={templates}
                         showDataTypes={false}
                         showHeader={false}
                         dropdownPlacement="top"
                         placeholder="Add histogram for..."
                         addExpression={addHistogram}
                         className={className + ' ' + styles['histograms-list']}
                         style={{ ...style, height: `100%` }} {...props}>
        {histograms.map((histogram, index) => (
            <Histogram data={histogram}
                       key={`${index}: ${histogram.id}`}
                       encodings={encodings}
                       removeHistogram={removeHistogram}/>
        ))}
        </ExpressionsList>
    );
};

Histograms = container({
    renderLoading: true,
    fragment: ({ templates = [], encodings, ...histograms }) => {

        if (!encodings) {
            return `{
                encodings: {
                    options: {
                        ['point', 'edge']: { color }
                    }
                }
            }`;
        }

        return `{
            templates: {
                length, [0...${templates.length}]: {
                    name, dataType, identifier, componentType
                }
            },
            id, name, length, ...${
                Histogram.fragments(histograms)
            },
            encodings: {
                options: {
                    ['point', 'edge']: { color }
                }
            }
        }`;
    },
    mapFragment: (histograms) => ({
        histograms,
        id: histograms.id,
        name: histograms.name,
        templates: histograms.templates,
        encodings: histograms.encodings
    }),
    dispatchers: {
        addHistogram, removeHistogram
    }
})(Histograms);

let Histogram = ({ loading = false,
                   dataType, componentType,
                   id, name, yScale = 'none',
                   global: _global = {}, masked = {},
                   binTouchMove, binTouchStart, binTouchCancel,
                   setEncoding, resetEncoding,
                   encodings,
                   removeHistogram, yScaleChanged }) => {

    const trans = Math[yScale] || ((x) => x);
    const { bins: maskedBins = [], isMasked } = masked;
    const { bins: globalBins = [], numBins = 1, maxElements = 1, binType = 'nodata' } = _global;

    return (
        <Sparkline id={id}
                   name={name}
                   yScale={yScale}
                   loading={loading}
                   dataType={dataType}
                   onClose={removeHistogram}
                   encodings={encodings}
                   componentType={componentType}
                   onYScaleChanged={yScaleChanged}
                   setEncoding={setEncoding}
                   resetEncoding={resetEncoding}>
        {globalBins.map((
            { values, count: globalCount }, index, bins,
            { count: maskedCount = 0 } = maskedBins[index] || {}) => (
            <SparklineBar key={`${id}-bar-${index}`}
                          binWidth={`${100 * (1/(numBins||1))}%`}
                          filterBounds={{ leftest: false, rightest: false }}
                          globalCount={globalCount} maskedCount={maskedCount}
                          name={name} color={null} values={values} enabled={false}
                          binType={binType} dataType={dataType} isMasked={isMasked}
                          onBinTouchMove={(event) => binTouchMove({ event, index })}
                          onBinTouchStart={(event) => binTouchStart({ event, index })}
                          onBinTouchCancel={(event) => binTouchCancel({ event, index })}
                          maskedHeight={`${100 * (trans(maskedCount || 0) / (trans(maxElements) || 1))}%`}
                          globalHeight={`${100 * (trans(globalCount || 0) / (trans(maxElements) || 1))}%`}/>
        ))}
        </Sparkline>
    );
};

Histogram = container({
    renderLoading: true,
    fragment: ({ global, masked } = {}) => `{
        id, name, yScale, dataType, componentType,
        global: ${ HistogramBins.fragment(global) } ${global ? `,
        masked: ${ HistogramBins.fragment(masked) }`: ''}
    }`,
    dispatchers: {
        binTouchMove,
        binTouchStart,
        binTouchCancel,
        yScaleChanged,
        setEncoding,
        resetEncoding,

    }
})(Histogram);

let HistogramBins = container({
    renderLoading: true,
    fragment: ({ bins } = {}) => `{
        id, name, yScale,
        numElements, maxElements,
        binType, binWidth, numBins,
        isMasked, dataType, componentType,
        bins: {
            length, ...${
                HistogramBin.fragments(bins)
            }
        }
    }`
})(() => {});

let HistogramBin = container({
    renderLoading: true,
    fragment: (bins = []) => `{
        count, values, exclude
    }`
})(() => {});

export { Histograms, Histogram };

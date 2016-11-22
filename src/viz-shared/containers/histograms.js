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
} from 'viz-shared/actions/encodings';

let Histograms = ({ addHistogram, removeHistogram, setEncoding, encodings = {},
                    templates = [], histograms = [],
                    loading = false, className = '',
                    style = {}, ...props }) => {

    const { options, point, edge } = encodings;

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
                       options={options}
                       encodings={{ edge, point }}
                       setEncoding={ setEncoding }
                       removeHistogram={removeHistogram}/>
        ))}
        </ExpressionsList>
    );
};

Histograms = container({
    renderLoading: true,
    fragment: ({ templates = [], encodings, ...histograms }) => {
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
                },
                point: { color, size },
                edge: { color }
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
        addHistogram, removeHistogram, setEncoding
    }
})(Histograms);

let Histogram = ({ loading = false,
                   options, encodings = {},
                   dataType, componentType,
                   id, name, yScale = 'none',
                   global: _global = {}, masked = {},
                   filter: { range = [], enabled = true } = {},
                   binTouchMove, binTouchStart, binTouchCancel,
                   removeHistogram, yScaleChanged, setEncoding }) => {

    const trans = Math[yScale] || ((x) => x);
    const filtered = range && range.length > 0;
    const { bins: maskedBins = [], isMasked } = masked;
    const { bins: globalBins = [], numBins = 1, maxElements = 1, binType = 'nodata' } = _global;
    const { color: {
        legend: colors = [],
        attribute: encodedAttribute
    } = {} } = encodings[componentType] || {};

    const isEncoded = name === encodedAttribute;

    return (
        <Sparkline id={id}
                   name={name}
                   yScale={yScale}
                   loading={loading}
                   options={options}
                   filtered={filtered}
                   dataType={dataType}
                   encodings={encodings}
                   onClose={removeHistogram}
                   isFilterEnabled={enabled}
                   setEncoding={setEncoding}
                   componentType={componentType}
                   onYScaleChanged={(value) => yScaleChanged({key: 'yScale', value})}>
        {globalBins.map((
            { values, count: globalCount }, binID, bins,
            binIsFiltered = filtered && !!(
                            binID >= range[0] &&
                            binID <= range[range.length - 1] ||
                            ~range.indexOf(binID)),
            { count: maskedCount = 0 } = maskedBins[binID] || {}) => (
            <SparklineBar index={binID}
                          encodings={encodings}
                          filtered={binIsFiltered}
                          key={`${id}-bar-${binID}`}
                          name={name} values={values}
                          componentType={componentType}
                          binWidth={`${100 * (1/(numBins||1))}%`}
                          color={isEncoded && colors[binID]}
                          filterBounds={{
                              leftest: binIsFiltered && binID <= range[0],
                              rightest: binIsFiltered && binID >= range[range.length - 1]
                          }}
                          globalCount={globalCount} maskedCount={maskedCount}
                          binType={binType} dataType={dataType} isMasked={isMasked}
                          onBinTouchMove={(event) => binTouchMove({ event, binID, binIsFiltered })}
                          onBinTouchStart={(event) => binTouchStart({ event, binID, binIsFiltered })}
                          onBinTouchCancel={(event) => binTouchCancel({ event, binID, binIsFiltered })}
                          maskedHeight={`${100 * (trans(maskedCount || 0) / (trans(maxElements) || 1))}%`}
                          globalHeight={`${100 * (trans(globalCount || 0) / (trans(maxElements) || 1))}%`}/>
        ))}
        </Sparkline>
    );
};

Histogram = container({
    renderLoading: true,
    fragment: ({ global, masked } = {}) => `{
        filter: { range, enabled },
        id, name, yScale, dataType, componentType,
        global: ${ HistogramBins.fragment(global) } ${ global ? `,
        masked: ${ HistogramBins.fragment(masked) }` :         ''}
    }`,
    dispatchers: {
        binTouchMove,
        binTouchStart,
        binTouchCancel,
        yScaleChanged
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

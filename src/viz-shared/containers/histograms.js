import React from 'react'
import { container } from '@graphistry/falcor-react-redux';
import {
    Sparkline,
    HistogramsList,
} from 'viz-shared/components/histograms';

import {
    addHistogram,
    removeHistogram,
    updateHistogram,
    highlightHistogram
} from 'viz-shared/actions/histograms';

import {
    setEncoding,
    resetEncoding
} from 'viz-shared/actions/encodings';

let Histograms = ({ templates = [], histograms = [], removeHistogram, ...props }) => {
    return (
        <HistogramsList templates={templates} {...props}>
        {histograms.map((histogram, index) => (
            <Histogram data={histogram}
                       key={`${index}: ${
                            histogram.type}: ${
                            histogram.attribute}`}
                       removeHistogram={removeHistogram}/>
        ))}
        </HistogramsList>
    );
};

Histograms = container(
    ({ templates = [], ...histograms }) => `{
        templates: {
            length, [0...${templates.length}]: {
                name, dataType, identifier, componentType
            }
        },
        id, name, length, ...${
            Histogram.fragments(histograms)
        }
    }`,
    (histograms) => ({
        histograms,
        id: histograms.id,
        name: histograms.name,
        templates: histograms.templates
    }),
    { addHistogram, removeHistogram }
)(Histograms);

let Histogram = container(
    ({ global, masked } = {}) => `{
        type, attribute,
        global: ${ HistogramFragment(global) } ${global ? `,
        masked: ${ HistogramFragment(masked) }`: ''}
    }`,
    (histogram) => histogram,
    { updateHistogram,
      setEncoding,
      resetEncoding,
      onBinMouseOver: highlightHistogram }
)(Sparkline);

function HistogramFragment() {
    return `{
        dataType,
        bins, binValues,
        numBins, numValues,
        type, attribute, binType,
        binWidth, minValue, maxValue
    }`;
}

export { Histograms, Histogram };

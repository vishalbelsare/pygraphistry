import React from 'react'
import { container } from '@graphistry/falcor-react-redux';
import {
    Sparkline,
    HistogramsList,
} from 'viz-shared/components/histograms';

// import {
//     addHistogram,
//     removeHistogram,
//     updateHistogram,
//     setHistogramEnabled,
//     cancelUpdateHistogram
// } from 'viz-shared/actions/histograms';

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
                name, dataType, attribute, componentType
            }
        },
        id, name, length ${Array
            .from(histograms || [], (xs, i) => xs)
            .reduce((xs, histogram = {}, index) =>
               `${xs},
                ${index}: ${
                    Histogram.fragment(histogram)
                }`
            , '')
        }
    }`,
    (histograms) => ({
        histograms,
        id: histograms.id,
        name: histograms.name,
        templates: histograms.templates
    })
)(Histograms);

let Histogram = container(
    ({ global, masked } = {}) => `{
        type, attribute,
        global: ${ HistogramFragment(global) } ${global ? `,
        masked: ${ HistogramFragment(masked) }`: ''}
    }`
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

import { getHistogramForAttribute } from './histograms.js';

function encodingWithoutBinValues(encoding) {
  if (!encoding) return encoding || null;
  const { binning: { valueToBin, ...restBinning } = {}, ...restEncoding } = encoding;
  return { binning: restBinning, ...restEncoding };
}

//view: {nbody: {dataframe, simulator}}
//encoding: {graphType, encodingType, attribute, variant, ?reset, ...}}
// -> Observable encoding or null
//  (do not need current encoding if clearing, just graphType & encodingType)
export function setEncoding({ view, encoding }) {
  const { nBody: { dataframe, simulator } = {} } = view;

  const { reset } = encoding;

  if (reset) {
    return dataframe.encodingsManager.setEncoding({ view, encoding });
  } else {
    //TODO getHistogram not necessary for all encodings, e.g., icon
    return getHistogramForAttribute({ view, ...encoding })
      .mergeMap(binning =>
        dataframe.encodingsManager.setEncoding({ view, encoding: { ...encoding, binning } })
      )
      .map(encodingWithoutBinValues);
  }
}

//view: {nbody: {dataframe, simulator}}    //view: {dataframe, simulator}
//encoding: {graphType, encodingType}
// -> {encoding, encodingSpec} or null
export function getEncoding({ view, encoding }) {
  const { nBody: { dataframe, simulator } = {} } = view;
  const out = dataframe.encodingsManager.getEncoding({ view, encoding });
  return !out
    ? null
    : {
        encoding: encodingWithoutBinValues(out.encoding),
        encodingSpec: encodingWithoutBinValues(out.encodingSpec)
      };
}

//view: {dataframe, simulator}
//encoding: {graphType, encodingType}
// -> partial encodingSpec
export function getEncodingOptions({ view, encoding }) {
  const { nBody: { dataframe, simulator } = {} } = view;
  return dataframe.encodingsManager.getEncodingOptions({ view, encoding });
}

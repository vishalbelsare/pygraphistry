//view: {nbody: {dataframe, simulator}}
//encoding: {graphType, encodingType, attribute, variant, ?reset, ...}}
// -> Observable encoding or null
//  (do not need current encoding if clearing, just graphType & encodingType)
export function setEncoding({ view, encoding }) {
    return view.nBody.dataframe.encodingsManager.setEncoding({ view, encoding });
}

//view: {nbody: {dataframe, simulator}}    //view: {dataframe, simulator}
//encoding: {graphType, encodingType}
// -> {encoding, encodingSpec} or null
export function getEncoding({ view, encoding }) {
    return view.nBody.dataframe.encodingsManager.getEncoding({ view, encoding });
}

//like setEncoding, but for default encoding
export function setDefaultEncoding({ view, encoding }) {
    return view.nBody.dataframe.encodingsManager.setDefaultEncoding({ view, encoding });
}

//like getEncoding, but for default encoding
export function getDefaultEncoding({ view, encoding }) {
    return view.nBody.dataframe.encodingsManager.getDefaultEncoding({ view, encoding });
}

//view: {dataframe, simulator}
//encoding: {graphType, encodingType}
// -> partial encodingSpec
export function getEncodingOptions({ view, encoding }) {
    const { nBody: { dataframe, simulator } = {} } = view;
    return dataframe.encodingsManager.getEncodingOptions({ view, encoding });
}

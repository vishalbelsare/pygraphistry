//view: {nbody: {dataframe, simulator}}
//encoding: {graphType, encodingType, attribute, variant, ?reset, ...}}
// -> Observable {encoding, encodingSpec} or null
//  (do not need current encoding if clearing, just graphType & encodingType)
export function setEncoding ({view, encoding}) {
    const { nBody: { dataframe, simulator } = {}} = view;
    return dataframe.encodingsManager.setEncoding({view, encoding});
}

//view: {nbody: {dataframe, simulator}}    //view: {dataframe, simulator}
//encoding: {graphType, encodingType}
// -> {encoding, encodingSpec} or null
export function getEncoding ({view, encoding}) {
    const { nBody: { dataframe, simulator } = {}} = view;
    return dataframe.encodingsManager.getEncoding({view, encoding});
}

//view: {dataframe, simulator}
//encoding: {graphType, encodingType}
// -> partial encodingSpec
export function getEncodingOptions({view, encoding}) {
    const { nBody: { dataframe, simulator } = {}} = view;
    return dataframe.encodingsManager.getEncodingOptions({view, encoding});
}
import { DataFrame } from 'dataframe-js';


// Normal df.union()) is glitchy on mismatched cols, do in js
// ?df * ?df -> ?df
export function dfUnion(dfA, dfB) {

    if (!dfA) { return dfB; }
    if (!dfB) { return dfA; }

    const arrA = dfA.toCollection();
    const arrB = dfB.toCollection();

    return new DataFrame(arrA.concat(arrB));

};




//dfUnion is glitchy when cols mismatch, fill with NAs
// ?df * ?df -> ?df
export function dfUnion(dfA, dfB) {

    if (!dfA) { return dfB; }
    if (!dfB) { return dfA; }

    const cA = dfA.listColumns();
    const cB = dfB.listColumns();
    const cols = cA.slice();
    cB.forEach((col) => {
        if (cols.indexOf(col) === -1) {
            cols.push(col);
        }
    });

    return dfA.restructure(cols).union(dfB.restructure(cols));
}


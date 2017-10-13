// {a -> b} * {b -> c} -> {a -> c}
export function colsToVals(colTypes, typeToVal) {
    return Object.keys(colTypes).reduce((acc, col) => {
        acc[col] = typeToVal[colTypes[col]];
        return acc;
    }, {});
}

//https://graphistry.github.io/docs/legacy/api/0.9.2/palette.html
export const colorShorthands = {
    blue: 1,
    brown: 11,
    gray: 60003,
    lightblue: 0,
    lightgreen: 2,
    orange: 7,
    pink: 4,
    red: 5
};

export const typeColorsAliases = {
    alert: 'red',
    event: 'orange',
    file: 'pink',
    geo: 'brown',
    hash: 'pink',
    id: 'gray',
    ip: 'blue',
    mac: 'lightblue',
    port: 'gray',
    tag: 'pink',
    url: 'lightgreen',
    user: 'blue'
};

export const typeColors = colsToVals(typeColorsAliases, colorShorthands);

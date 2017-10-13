'use strict';

// Provides palettes
// Adds a final 'repeating' PairedRepeat singleton palette

const _ = require('underscore');
const brewer = require('colorbrewer');
const sprintf = require('sprintf-js').sprintf;

//////////// SORT PALETTES

//fixed ~alphabetic order
const palettes = [
    'Paired',
    'Blues',
    'BrBG',
    'BuGn',
    'BuPu',
    'Dark2',
    'GnBu',
    'Greens',
    'Greys',
    'OrRd',
    'Oranges',
    'PRGn',
    'Accent',
    'Pastel1',
    'Pastel2',
    'PiYG',
    'PuBu',
    'PuBuGn',
    'PuOr',
    'PuRd',
    'Purples',
    'RdBu',
    'RdGy',
    'RdPu',
    'RdYlBu',
    'RdYlGn',
    'Reds',
    'Set1',
    'Set2',
    'Set3',
    'Spectral',
    'YlGn',
    'YlGnBu',
    'YlOrBr',
    'YlOrRd',
    'PairedRepeat'
];

//redone for printing below
brewer.PairedRepeat = {
    0: _.flatten(_.times(10000, () => brewer.Paired[12]))
};

////////////// BIND PALETTES

// int -> '#RRGGBB'
function intToHex(value) {
    return sprintf('#%02x%02x%02x', value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff);
}

/**
 * '#AABBCC' -> int
 * TODO: this returns ABGR as that's what VGraphLoader sends to the client
 * @param {String} hexColor The color as an hex string
 * @return {Number} The integer encoding the color
 */
function hexToABGR(hexColor) {
    let out = hexColor;
    if (typeof hexColor === 'string') {
        out = parseInt(hexColor.replace('#', '0x'), 16);
    }

    //sadness, rgba => abgr
    const r = (out >> 16) & 255,
        g = (out >> 8) & 255,
        b = out & 255;
    return (b << 16) | (g << 8) | r;
}

//{<string> -> {<int> -> [int]_int}}
//Ex:  palettes['Paired']['12'][3] == 3383340
const palettesToColorInts = {};

//{int -> int}
//Ex: bindings[9 * 1000 + 3] == 3383340
const categoryToColorInt = {};

//{<string> -> {<int> -> {hexes: [string], offset: int}}}
const all = {};

let encounteredPalettes = 0;
palettes.forEach(palette => {
    palettesToColorInts[palette] = {};
    all[palette] = {};

    const dims = Object.keys(brewer[palette]);

    //for legacy/convenience, biggest first
    dims.sort((a, b) => a - b);
    dims.reverse();

    dims.forEach(dim => {
        //use to create palette.out

        const paletteOffset = encounteredPalettes * 1000;
        palettesToColorInts[palette][dim] = brewer[palette][dim].map(hexToABGR);
        palettesToColorInts[palette][dim].forEach((color, idx) => {
            categoryToColorInt[paletteOffset + idx] = color;
        });

        all[palette][dim] = {
            offset: paletteOffset,
            hexes: brewer[palette][dim]
        };

        encounteredPalettes++;
    });
});

function valuesFitOnePaletteCategory(intValues) {
    if (intValues.length === 0) {
        return true;
    }
    const paletteNumbers = _.map(intValues, intValue => Math.floor(intValue / 1000)),
        firstPaletteNumber = paletteNumbers[0],
        firstPaletteOffset = firstPaletteNumber * 1000;
    if (firstPaletteNumber >= encounteredPalettes) {
        return false;
    }
    return _.every(intValues, (intValue, idx) => {
        return (
            paletteNumbers[idx] === firstPaletteNumber &&
            categoryToColorInt[firstPaletteOffset + idx] !== undefined
        );
    });
}

//////////////

export {
    palettesToColorInts,
    categoryToColorInt,
    valuesFitOnePaletteCategory,
    hexToABGR,
    intToHex
};

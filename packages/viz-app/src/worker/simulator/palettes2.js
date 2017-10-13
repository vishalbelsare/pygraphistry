import brewer from 'colorbrewer';
import _ from 'underscore';

//smallest, middlest, & biggest of every brewer palette
export const colorPalettes = []
    .concat(
        ...Object.keys(brewer).map(paletteName => [
            {
                paletteName,
                paletteLen: Math.min.call(null, ...Object.keys(brewer[paletteName]).map(Number))
            },
            {
                paletteName,
                paletteLen: Object.keys(brewer[paletteName])[
                    Math.floor(Object.keys(brewer[paletteName]).length / 2)
                ]
            },
            {
                paletteName,
                paletteLen: Math.max.call(null, ...Object.keys(brewer[paletteName]).map(Number))
            }
        ])
    )
    .map(({ paletteName, paletteLen }) => ({
        name: paletteName + paletteLen,
        colors: brewer[paletteName][paletteLen]
    }));

//shaped for encodings lookups & use
const multiplexedPalettesRaw = [].concat(
    colorPalettes.map(({ name, colors }) => ({
        variant: 'categorical',
        name: `${name}:categorical:${colors.length}`,
        colors: colors,
        label: `Categorical (${name} ${colors.length})`
    })),
    colorPalettes.map(({ name, colors }) => ({
        variant: 'continuous',
        name: `${name}:continuous:${colors.length}`,
        colors: colors,
        label: `Gradient (${name} ${colors.length})`
    }))
);

const picks = [
    ['Set19', 9, 'categorical'],
    ['Paired12', 12, 'categorical'],
    ['Reds3', 3, 'continuous'],
    ['Blues3', 3, 'continuous'],
    ['Greens3', 3, 'continuous']
]
    .map(
        ([pName, pLen, pVariant]) =>
            multiplexedPalettesRaw.filter(({ name }) => name === `${pName}:${pVariant}:${pLen}`)[0]
    )
    .map(({ name, ...rest }) => ({
        name: `${name}:top`,
        ...rest
    }));

export const multiplexedPalettes = picks.concat(multiplexedPalettesRaw);

export const layouts = [
    {
        id: 'stackedBushyGraph',
        controls: 'lockedAtlasBarnesXY',
        friendlyName: 'Investigation' // Layout"
    },
    {
        id: 'atlasbarnes',
        controls: 'atlasbarnes',
        friendlyName: 'Force Directed' // Layout"
    },
    {
        id: 'insideout',
        controls: 'lockedAtlasBarnesR',
        friendlyName: 'Network Map' // Layout"
    }
];

export const pointIconEncoding = {
    attribute: 'canonicalType',
    mapping: {
        categorical: {
            fixed: {
                alert: 'exclamation',
                event: 'exclamation-circle',
                file: 'file',
                geo: 'flag',
                hash: 'file-text',
                id: 'barcode',
                ip: 'desktop',
                mac: 'desktop',
                port: 'microchip',
                tag: 'tag',
                url: 'link',
                user: 'user'
            },
            other: 'question'
        }
    }
};

//Tweak over the browser defaults
const colorRemapping = {
    blue: '#256599',
    brown: '#5D7850',
    gray: '#EDEDED',
    orange: '#FF9D40',
    lightblue: '#40A7FF',
    lightgreen: '#6DB34B',
    pink: '#C55288',
    red: '#E75D51'
};

export const pointColorEncoding = {
    attribute: 'canonicalType',
    variation: 'categorical',
    mapping: {
        categorical: {
            fixed: {
                alert: colorRemapping['red'],
                event: colorRemapping['orange'],
                file: colorRemapping['pink'],
                geo: colorRemapping['brown'],
                hash: colorRemapping['pink'],
                id: colorRemapping['gray'],
                ip: colorRemapping['blue'],
                mac: colorRemapping['lightblue'],
                port: colorRemapping['gray'],
                tag: colorRemapping['pink'],
                url: colorRemapping['lightgreen'],
                user: colorRemapping['blue']
            },
            other: colorRemapping['gray']
        }
    }
};

const sizeVals = {
    big: 100,
    medium: 80,
    small: 40
};

export const pointSizeEncoding = {
    attribute: 'canonicalType',
    mapping: {
        categorical: {
            fixed: {
                alert: sizeVals.big,
                ip: sizeVals.big,
                mac: sizeVals.big,
                user: sizeVals.big,
                file: sizeVals.medium,
                geo: sizeVals.medium,
                hash: sizeVals.medium,
                id: sizeVals.medium,
                port: sizeVals.medium,
                tag: sizeVals.medium,
                url: sizeVals.medium,
                event: sizeVals.small
            },
            other: sizeVals.small
        }
    }
};

const all = {
    pointIconEncoding,
    pointIconEncodingDefault: pointIconEncoding,
    pointColorEncoding,
    pointColorEncodingDefault: pointColorEncoding,
    pointSizeEncoding,
    pointSizeEncodingDefault: pointSizeEncoding
};

export const uiTweaks = {
    atlasbarnes: {
        ...all,
        pointSize: 1,
        dissuadeHubs: true,
        gravity: 8,
        scalingRatio: 12
    },
    insideout: {
        ...all,
        pointSize: 1,
        defaultShowArrows: false,
        defaultShowPointsOfInterest: true,
        dissuadeHubs: true
    },
    stackedBushyGraph: {
        ...all,
        pointSize: 2,
        defaultShowArrows: false,
        defaultShowPointsOfInterest: true,
        play: 0
    }
};

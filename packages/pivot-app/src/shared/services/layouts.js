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

const all = {
    pointIconEncoding,
    pointIconEncodingDefault: pointIconEncoding,
    pointColorEncoding,
    pointColorEncodingDefault: pointColorEncoding
};

export const uiTweaks = {
    atlasbarnes: {
        ...all,
        pointSize: 0.4,
        dissuadeHubs: true,
        gravity: 8,
        scalingRatio: 12
    },
    insideout: {
        ...all,
        pointSize: 0.4,
        defaultShowArrows: false,
        defaultShowPointsOfInterest: true,
        dissuadeHubs: true
    },
    stackedBushyGraph: {
        ...all,
        pointSize: 0.6,
        defaultShowArrows: false,
        defaultShowPointsOfInterest: true,
        play: 0
    }
};

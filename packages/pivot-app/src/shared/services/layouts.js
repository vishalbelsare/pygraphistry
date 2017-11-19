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
                log: 'database',
                mac: 'desktop',
                port: 'microchip',
                product: 'window-maximize',
                tag: 'tag',
                url: 'link',
                user: 'user',
                vendor: 'window-maximize'
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

// alert, event, file, id, ip, mac
// port, product, url, log, user, vendor
export const pointColorEncoding = {
    attribute: 'canonicalType',
    variation: 'categorical',
    mapping: {
        categorical: {
            fixed: {
                alert: colorRemapping.red,
                event: colorRemapping.orange,
                file: colorRemapping.pink,
                geo: colorRemapping.brown,
                hash: colorRemapping.pink,
                id: colorRemapping.gray,
                ip: colorRemapping.blue,
                log: colorRemapping.gray,
                mac: colorRemapping.lightblue,
                port: colorRemapping.gray,
                product: colorRemapping.gray,
                tag: colorRemapping.pink,
                url: colorRemapping.lightgreen,
                user: colorRemapping.blue,
                vendor: colorRemapping.gray
            },
            other: colorRemapping.gray
        }
    }
};

const sizeVals = {
    big: 100,
    medium: 80,
    small: 40
};

// alert, event, file, id, ip, mac
// port, product, url, log, user, vendor
export const pointSizeEncoding = {
    attribute: 'canonicalType',
    mapping: {
        categorical: {
            fixed: {
                alert: sizeVals.big,
                event: sizeVals.small,
                file: sizeVals.medium,
                geo: sizeVals.medium,
                hash: sizeVals.medium,
                id: sizeVals.medium,
                ip: sizeVals.big,
                mac: sizeVals.big,
                port: sizeVals.medium,
                product: sizeVals.medium,
                log: sizeVals.medium,
                url: sizeVals.medium,
                user: sizeVals.big,
                tag: sizeVals.medium,
                vendor: sizeVals.medium
            },
            other: sizeVals.small
        }
    }
};

const allEncodings = {
    pointIconEncoding,
    pointIconEncodingDefault: pointIconEncoding,
    pointColorEncoding,
    pointColorEncodingDefault: pointColorEncoding,
    pointSizeEncoding,
    pointSizeEncodingDefault: pointSizeEncoding
};

export const encodingsByLayoutId = {
    atlasbarnes: { ...allEncodings },
    insideout: { ...allEncodings },
    stackedBushyGraph: { ...allEncodings }
};

export const uiTweaks = {
    atlasbarnes: {
        pointSize: 1,
        dissuadeHubs: true,
        gravity: 8,
        scalingRatio: 12
    },
    insideout: {
        pointSize: 1,
        defaultShowArrows: false,
        defaultShowPointsOfInterest: true,
        dissuadeHubs: true
    },
    stackedBushyGraph: {
        pointSize: 2,
        defaultShowArrows: false,
        defaultShowPointsOfInterest: true,
        play: 0
    }
};

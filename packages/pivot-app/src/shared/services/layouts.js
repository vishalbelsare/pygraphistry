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
                host: 'desktop',
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
    red: '#E75D51',
    purple: '#A71AD3',
    green: '#268D59',
    darkorange: '#C67600',
    magenta: '#B42852',
    darkblue: '#1B3872',
    darkred: '#760E0E',
    darkgreen: '#1C5437',
    mint: '#84DBAE',
    lightpurple: '#6F45E2'
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
                host: colorRemapping.lightblue,
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

export const pointPivotColorEncoding = {
    attribute: 'Pivot',
    variation: 'categorical',
    mapping: {
        categorical: {
            fixed: {
                0: colorRemapping.pink,
                1: colorRemapping.blue,
                2: colorRemapping.orange,
                3: colorRemapping.brown,
                4: colorRemapping.lightgreen,
                5: colorRemapping.lightblue,
                6: colorRemapping.red,
                7: colorRemapping.purple,
                8: colorRemapping.green,
                9: colorRemapping.darkorange,
                10: colorRemapping.magenta,
                11: colorRemapping.darkblue,
                12: colorRemapping.darkred,
                13: colorRemapping.darkgreen,
                14: colorRemapping.mint,
                15: colorRemapping.lightpurple,
                16: colorRemapping.pink,
                17: colorRemapping.blue,
                18: colorRemapping.orange,
                19: colorRemapping.brown,
                20: colorRemapping.lightgreen,
                21: colorRemapping.lightblue,
                22: colorRemapping.red,
                23: colorRemapping.purple,
                24: colorRemapping.green,
                25: colorRemapping.darkorange,
                26: colorRemapping.magenta,
                27: colorRemapping.darkblue,
                28: colorRemapping.darkred,
                29: colorRemapping.darkgreen,
                30: colorRemapping.mint,
                31: colorRemapping.lightpurple,
                32: colorRemapping.pink,
                33: colorRemapping.blue,
                34: colorRemapping.orange,
                35: colorRemapping.brown,
                36: colorRemapping.lightgreen,
                37: colorRemapping.lightblue,
                38: colorRemapping.red,
                39: colorRemapping.purple,
                40: colorRemapping.green,
                41: colorRemapping.darkorange,
                42: colorRemapping.magenta,
                43: colorRemapping.darkblue,
                44: colorRemapping.darkred,
                45: colorRemapping.darkgreen,
                46: colorRemapping.mint,
                47: colorRemapping.lightpurple,
                48: colorRemapping.darkgreen,
                49: colorRemapping.mint,
                50: colorRemapping.lightpurple
            },
            other: colorRemapping.gray
        }
    }
};

export const pointPivotIconEncoding = {
    attribute: 'Pivot',
    variation: 'categorical',
    mapping: {
        categorical: {
            fixed: {
                0: 'battery-0',
                1: 'battery-1',
                2: 'battery-2',
                3: 'battery-3',
                4: 'battery-4'
            },
            other: 'bolt'
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
                host: sizeVals.big,
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
    pointLegendTypeIconEncoding: pointIconEncoding,
    pointLegendTypeColorEncoding: pointColorEncoding,
    pointLegendTypeSizeEncoding: pointSizeEncoding,
    pointLegendPivotColorEncoding: pointPivotColorEncoding,
    pointIconEncodingDefault: pointIconEncoding,
    pointColorEncodingDefault: pointColorEncoding,
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

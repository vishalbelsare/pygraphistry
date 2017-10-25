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

const all = {};

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

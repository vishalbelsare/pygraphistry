export const layouts = [
                        {id: "stackedBushyGraph",
                         controls: "lockedAtlasBarnesXY",
                         friendlyName: "Investigation"// Layout"
                        },
                        {id: "atlasbarnes",
                         controls: "atlasbarnes",
                         friendlyName: "Force Directed"// Layout"
                        },
                        {id: "insideout",
                         controls: "lockedAtlasBarnesXY",
                         friendlyName: "Network Map"// Layout"
                        },
                        ];

export const uiTweaks = {
    atlasbarnes: {},
    insideout: {
        showArrows: false,
        showPointsOfInterest: true,
        play: 0,
    },
    stackedBushyGraph: {
        showArrows: false,
        showPointsOfInterest: true,
        play: 0,
    },
};

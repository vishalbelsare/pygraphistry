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
                         controls: "lockedAtlasBarnesR",
                         friendlyName: "Network Map"// Layout"
                        },
                        ];

export const uiTweaks = {
    atlasbarnes: {},
    insideout: {
        showArrows: false,
        showPointsOfInterest: true,
    },
    stackedBushyGraph: {
        showArrows: false,
        showPointsOfInterest: true,
        play: 0,
    },
};

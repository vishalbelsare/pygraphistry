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
    atlasbarnes: [],
    insideout: [],
    stackedBushyGraph: [
                        ['updateSetting', 'edgeOpacity', 0.05],
                        ['updateSetting', 'showArrows', false],
                        ['updateSetting', 'labelPOI', false],
                        ['updateSetting', 'pointSize', 0.1],
                        ],
};

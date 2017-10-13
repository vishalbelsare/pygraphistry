import { textureDataSources } from './enum';

export const textures = {
    hitmap: {
        datasource: textureDataSources.CLIENT,
        width: { unit: 'percent', value: 25 },
        height: { unit: 'percent', value: 25 },
        uniforms: {
            textureScalingFactor: 25 / 100.0
        }
    },
    pointTexture: {
        datasource: textureDataSources.CLIENT,
        retina: true
    },
    steadyStateTexture: {
        datasource: textureDataSources.CLIENT,
        retina: true
    },
    pointHitmapDownsampled: {
        datasource: textureDataSources.CLIENT,
        width: { unit: 'percent', value: 5 },
        height: { unit: 'percent', value: 5 },
        uniforms: {
            textureScalingFactor: 5 / 100.0
        }
    },
    colorMap: {
        datasource: textureDataSources.SERVER,
        path: 'test-colormap2.png'
    }
};

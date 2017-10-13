import { VBODataSources, textureDataSources } from './enum';

export * from './enum';
export * from './scene';
export * from './items';
export * from './models';
export * from './scenes';
export * from './programs';
export * from './textures';

export function isBufClientSide(model) {
    for (const attributeName in model) {
        const { datasource } = model[attributeName];
        return (
            datasource === VBODataSources.CLIENT ||
            datasource === 'VERTEX_INDEX' ||
            datasource === 'EDGE_INDEX'
        );
    }
    return false;
}

export function isBufServerSide(model) {
    for (const attributeName in model) {
        const { datasource } = model[attributeName];
        return datasource === 'HOST' || datasource === VBODataSources.DEVICE;
    }
    return false;
}

export function isTextureServerSide(texture) {
    return texture.datasource === textureDataSources.SERVER;
}

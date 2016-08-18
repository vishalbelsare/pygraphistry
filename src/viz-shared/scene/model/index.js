import { VBODataSources, textureDataSources } from './enum';
import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function scene(workbookId, viewId, scene) {
    const route = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        scene: {
            hints: {
                edges: $atom(undefined, { $expires: 1 }),
                points: $atom(undefined, { $expires: 1})
            },
            ...scene,
            labelsById: {},
            simulating: false,
            labels: { length: 0 },
            highlight: $atom('highlight'),
            selection: $atom('selection'),
            camera: {
                ...scene.camera, ...{
                    zoom: 1,
                    center: { x: 0.5, y: 0.5 },
                    width: 1, height: 1, zoom: 1,
                    edges: { scaling: 1, opacity: 1 },
                    points: { scaling: 1, opacity: 1 }
                }
            }
        }
    };
}

export * from './enum';
export * from './items';
export * from './models';
export * from './scenes';
export * from './programs';
export * from './textures';

export function isBufClientSide(model) {
    for (const attributeName in model) {
        const { datasource } = model[attributeName];
        return (datasource === VBODataSources.CLIENT || datasource === 'VERTEX_INDEX' || datasource === 'EDGE_INDEX');
    }
    return false;
}

export function isBufServerSide(model) {
    for (const attributeName in model) {
        const { datasource } = model[attributeName];
        return (datasource === 'HOST' || datasource === VBODataSources.DEVICE);
    }
    return false;
}

export function isTextureServerSide(texture) {
    return texture.datasource  === textureDataSources.SERVER;
}

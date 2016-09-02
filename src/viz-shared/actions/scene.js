export const LAYOUT_SCENE = 'layout-scene';
export const LAYOUT_CAMERA = 'layout-camera';

export const layoutScene = (props) => ({
    ...props, type: LAYOUT_SCENE
});

export const layoutCamera = (props) => ({
    ...props, type: LAYOUT_CAMERA
});

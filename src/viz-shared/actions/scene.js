export const CAMERA_MOVE = 'camera-move';
export const LAYOUT_SCENE = 'layout-scene';
export const CENTER_CAMERA = 'center-camera';

export const moveCamera = (event) => ({
    event, type: CAMERA_MOVE
});

export const layoutScene = (props) => ({
    ...props, type: LAYOUT_SCENE
});

export const centerCamera = (props) => ({
    ...props, type: CENTER_CAMERA
});

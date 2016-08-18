import styles from './canvas.less';
import { Component } from 'reaxtor';
import { Observable } from 'rxjs';

export class Canvas extends Component {
    // loadProps(model) {
    //     return model.get(...[
    //         `hints['edges', 'points']`,
    //         `server['buffers', 'textures']`,
    //         `options[
    //             'enable', 'disable', 'depthFunc', 'clearColor',
    //             'lineWidth', 'blendFuncSeparate', 'blendEquationSeparate'
    //         ]`,
    //         `camera['edges', 'points']['scaling', 'opacity']`,
    //         `camera['type', 'nearPlane', 'farPlane']`,
    //         `camera.bounds['top', 'left', 'bottom', 'right']`,
    //         `[
    //             'targets', 'programs', 'arcHeight', 'triggers',
    //             'buffers', 'textures', 'selection', 'highlight',
    //             'items', 'modes', 'render', 'models', 'uniforms',
    //             'numRenderedSplits', 'clientMidEdgeInterpolation'
    //         ]`,
    //     ]);
    // }
    render(state) {
        return (
            <canvas
                id='simulation'
                class_={{ [styles['sim']]: true }}>
                    WebGL not supported
            </canvas>
        );
    }
}

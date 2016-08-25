import { container } from 'reaxtor-redux';
import { Canvas } from './canvas';
import { Labels } from './labels';
import { Selection } from './selection';

export const Scene = container(
    ({ labels, layout = {}, selection, settings = [] } = {}) => {
        const { settings: layoutSettings = [] } = layout;
        return `{
            labels: ${
                Labels.fragment(labels)
            },
            selection: ${
                Selection.fragment(selection)
            },
            id, name, settings: {
                length, [0...${settings.length}]: {
                    id
                }
            },
            layout: {
                id, name, settings: {
                    length, [0...${layoutSettings.length}]: {
                        id
                    }
                }
            },
            camera: {
                type, nearPlane, farPlane,
                bounds: { top, left, bottom, right },
                ['edges', 'points']: { scaling, opacity }
            },
            hints: { edges, points },
            server: { buffers, textures },
            options: {
                enable, disable, depthFunc, clearColor,
                lineWidth, blendFuncSeparate, blendEquationSeparate
            },
            items, modes, render, models, uniforms,
            targets, programs, arcHeight, triggers, buffers, textures,
            numRenderedSplits, clientMidEdgeInterpolation
        }`
    },
    (scene) => ({
        scene,
        labels: scene.labels,
        selection: scene.selection
    })
)(renderScene);

function renderScene({ scene, labels, selection }) {
    return (
        <div style={{ width: `100%`, heigth: `100%`, position: `absolute`,
                      color: `white`, textAlign: `center` }}>
            {/*<canvas className='canvas'/>*/}
            <Canvas key='canvas' {...scene}/>
            <Labels key='labels' data={labels}/>
            <Selection key='selection' data={selection}/>
        </div>
    );
}

import React, { PropTypes } from 'react';
import { container } from '@graphistry/falcor-react-redux';
import { compose, getContext, hoistStatics } from 'recompose';
import { layoutScene, layoutCamera } from 'viz-shared/actions/scene';

export const Scene = compose(
    hoistStatics(getContext({ Renderer: PropTypes.func })),
    container(
        ({ labels, selection, Renderer } = {}) => {
            return `{

                id, name, simulating,

                camera: {
                    type, zoom, center,
                    nearPlane, farPlane,
                    edges: { scaling, opacity },
                    points: { scaling, opacity },
                    bounds: { top, left, bottom, right }
                },

                canvas: {
                    background: { color },
                    foreground: { color },
                    hints: { edges, points },
                    server: { buffers, textures },
                    options: {
                        enable, disable, depthFunc, clearColor,
                        lineWidth, blendFuncSeparate, blendEquationSeparate
                    },
                    items, modes, render, models, uniforms,
                    targets, programs, arcHeight, triggers, buffers, textures,
                    numRenderedSplits, clientMidEdgeInterpolation
                }
            }`
        },
        (scene) => scene,
        { layoutScene, layoutCamera }
    )
)(renderScene);

function renderScene({ camera, canvas, simulating, Renderer, layoutScene, layoutCamera }) {
    return (
        <div style={{ width: `100%`, height: `100%`, position: `absolute` }}>
            <Renderer key='renderer'
                      camera={camera}
                      canvas={canvas}
                      simulating={simulating}
                      layoutScene={layoutScene}
                      layoutCamera={layoutCamera}/>
        </div>
    );
}

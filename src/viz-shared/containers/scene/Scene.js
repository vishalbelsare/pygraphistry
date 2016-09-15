import React, { PropTypes } from 'react';
import { container } from '@graphistry/falcor-react-redux';
import { compose, getContext, hoistStatics } from 'recompose';
import {
    moveCamera,
    layoutScene,
    centerCamera
} from 'viz-shared/actions/scene';

export const Scene = compose(
    hoistStatics(getContext({ Renderer: PropTypes.func })),
    container(
        ({ labels, selection, Renderer } = {}) => {
            return `{

                id, name, simulating,
                showArrows, pruneOrphans,

                camera: {
                    type, zoom, center,
                    nearPlane, farPlane,
                    edges: { scaling, opacity },
                    points: { scaling, opacity },
                    bounds: { top, left, bottom, right }
                },

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
            }`
        },
        (scene) => ({ scene }),
        { moveCamera, centerCamera, layoutScene }
    )
)(renderScene);

function renderScene({ scene, Renderer, moveCamera, centerCamera, layoutScene }) {
    return (
        <div style={{ width: `100%`, height: `100%`, position: `absolute` }}>
            <Renderer key='renderer'
                      scene={scene}
                      moveCamera={moveCamera}
                      layoutScene={layoutScene}
                      centerCamera={centerCamera}/>
        </div>
    );
}

import React, { PropTypes } from 'react';
import { Labels } from './labels';
import { Selection } from './selection';
import { container } from 'reaxtor-redux';
import { compose, getContext, hoistStatics } from 'recompose';
import { layoutScene, layoutCamera } from 'viz-shared/actions/scene';

export const Scene = compose(
    hoistStatics(getContext({ Renderer: PropTypes.func })),
    container(
        ({ labels, selection, Renderer } = {}) => {
            return `{

                layout: { id, name },
                labels: ${ Labels.fragment(labels) },
                selection: ${ Selection.fragment(selection) },

                id, name, simulating,
                background: { color },
                foreground: { color },
                hints: { edges, points },
                server: { buffers, textures },
                camera: {
                    type, zoom, center,
                    nearPlane, farPlane,
                    edges: { scaling, opacity },
                    points: { scaling, opacity },
                    bounds: { top, left, bottom, right }
                },
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
        }),
        { layoutScene, layoutCamera }
    )
)(renderScene);

function renderScene({ scene, labels, selection,
                       Renderer, layoutScene, layoutCamera }) {
    return (
        <div style={{ width: `100%`, height: `100%`, position: `absolute`
                      , textAlign: `center`, color: 'white' }}>
            <Renderer key='renderer'
                      scene={scene}
                      layoutScene={layoutScene}
                      layoutCamera={layoutCamera}/>
            <Labels key='labels' data={labels}/>
            <Selection key='selection' data={selection}/>
        </div>
    );
}

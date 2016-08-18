import React from 'react'
import Camera from './Camera';
import { connect } from 'reaxtor-redux';

function SceneContainer({ camera } = {}) {

}

function SceneFragment(falcor, scene) {
    return falcor.get(...falcor.QL`{

        hints: { edges, points },
        server: { buffers, textures },

        options: {
            enable, disable, depthFunc, clearColor,
            lineWidth, blendFuncSeparate, blendEquationSeparate
        },

        camera: {
            type, nearPlane, farPlane,
            ['edges', 'points']: {
                scaling, opacity
            },
            bounds: {
                top, left, bottom, right
            }
        },

        items, modes, render, models, uniforms,
        targets, programs, arcHeight, triggers,
        buffers, textures, highlight, selection,
        numRenderedSplits, clientMidEdgeInterpolation
    }`);
}

export default connect(
    SceneFragment
)(SceneContainer, {
    camera: Camera.fragment
});


import React from 'react'
import Camera from './Camera';
import { connect } from 'reaxtor-redux';

function CameraContainer() {
    return <i></i>;
}

function CameraFragment(falcor, camera) {
    return falcor.get(...falcor.QL`{
        type, nearPlane, farPlane,
        ['edges', 'points']: {
            scaling, opacity
        },
        bounds: {
            top, left, bottom, right
        }
    }`);
}

export default connect(
    CameraFragment
)(CameraContainer);


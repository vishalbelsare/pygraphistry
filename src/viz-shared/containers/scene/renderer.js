import React from 'react';
import { container } from '@graphistry/falcor-react-redux';

export function Renderer() {
    return (
        <canvas id='simulation' style={{
            width: `100%`,
            height:`100%`,
            position:`absolute` }}>
            WebGL not supported
        </canvas>
    );
}

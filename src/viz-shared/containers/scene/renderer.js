import React from 'react';
import { container } from '@graphistry/falcor-react-redux';

export function Renderer() {
    return (
        <div id='simulation-container'
             style={{
                width: `100%`,
                height:`100%`,
                position:`absolute`
            }}
        />
    );
}

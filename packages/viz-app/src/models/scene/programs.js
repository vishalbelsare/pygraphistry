export const programs = {
    edgehighlight: {
        sources: {
            vertex: require('viz-app/shaders/edgehighlighted.vertex.glsl'),
            fragment: require('viz-app/shaders/edgehighlighted.fragment.glsl')
        },
        attributes: ['curPos'],
        camera: 'mvp',
        uniforms: []
    },
    arrow: {
        sources: {
            vertex: require('viz-app/shaders/arrow.vertex.glsl'),
            fragment: require('viz-app/shaders/arrow.fragment.glsl')
        },
        attributes: ['startPos', 'endPos', 'normalDir', 'arrowColor', 'pointSize'],
        camera: 'mvp',
        uniforms: [
            'zoomScalingFactor',
            'maxPointSize',
            'maxScreenSize',
            'maxCanvasSize',
            'edgeOpacity'
        ]
    },
    radialaxes: {
        sources: {
            vertex: require('viz-app/shaders/radial-axis.vertex.glsl'),
            fragment: require('viz-app/shaders/radial-axis.fragment.glsl')
        },
        attributes: ['aPos', 'aCenter', 'aRadius'],
        camera: 'mvp',
        uniforms: []
    },
    arrowhighlight: {
        sources: {
            vertex: require('viz-app/shaders/arrowhighlighted.vertex.glsl'),
            fragment: require('viz-app/shaders/arrowhighlighted.fragment.glsl')
        },
        attributes: ['startPos', 'endPos', 'normalDir', 'pointSize', 'arrowColor'],
        camera: 'mvp',
        uniforms: ['zoomScalingFactor', 'maxPointSize', 'maxScreenSize', 'maxCanvasSize']
    },
    edges: {
        sources: {
            vertex: require('viz-app/shaders/edge.vertex.glsl'),
            fragment: require('viz-app/shaders/edge.fragment.glsl')
        },
        attributes: ['edgeColor', 'curPos'],
        camera: 'mvp',
        uniforms: []
    },
    midedges: {
        sources: {
            vertex: require('viz-app/shaders/midedge.vertex.glsl'),
            fragment: require('viz-app/shaders/midedge.fragment.glsl')
        },
        attributes: ['curPos'],
        camera: 'mvp',
        uniforms: []
    },
    midedgeculled: {
        sources: {
            vertex: require('viz-app/shaders/midedgeculled.vertex.glsl'),
            fragment: require('viz-app/shaders/midedgeculled.fragment.glsl')
        },
        attributes: ['curPos', 'edgeColor', 'startPos', 'endPos'],
        camera: 'mvp',
        uniforms: ['edgeOpacity', 'isOpaque']
    },
    edgeselected: {
        sources: {
            vertex: require('viz-app/shaders/midedgeselected.vertex.glsl'),
            fragment: require('viz-app/shaders/midedgeculled.fragment.glsl')
        },
        attributes: ['curPos', 'edgeColor', 'startPos', 'endPos'],
        camera: 'mvp',
        uniforms: ['isOpaque']
    },
    pointculled: {
        sources: {
            vertex: require('viz-app/shaders/pointculled.vertex.glsl'),
            fragment: require('viz-app/shaders/pointculled.fragment.glsl')
        },
        attributes: ['curPos', 'pointSize', 'pointColor'],
        camera: 'mvp',
        uniforms: [
            'fog',
            'stroke',
            'zoomScalingFactor',
            'maxPointSize',
            'minPointSize',
            'pointOpacity'
        ]
    },
    pointhighlight: {
        sources: {
            vertex: require('viz-app/shaders/pointhighlighted.vertex.glsl'),
            fragment: require('viz-app/shaders/pointculled.fragment.glsl')
        },
        attributes: ['curPos', 'pointSize', 'pointColor'],
        camera: 'mvp',
        uniforms: [
            'fog',
            'stroke',
            'zoomScalingFactor',
            'maxPointSize',
            'minPointSize',
            'pointOpacity'
        ]
    },
    pointselected: {
        sources: {
            vertex: require('viz-app/shaders/pointselected.vertex.glsl'),
            fragment: require('viz-app/shaders/pointculled.fragment.glsl')
        },
        attributes: ['curPos', 'pointSize', 'pointColor'],
        camera: 'mvp',
        uniforms: [
            'fog',
            'stroke',
            'zoomScalingFactor',
            'maxPointSize',
            'minPointSize',
            'pointOpacity'
        ]
    },
    points: {
        sources: {
            vertex: require('viz-app/shaders/point.vertex.glsl'),
            fragment: require('viz-app/shaders/point.fragment.glsl')
        },
        attributes: ['curPos', 'pointSize', 'pointColor'],
        camera: 'mvp',
        uniforms: ['zoomScalingFactor', 'textureScalingFactor', 'maxPointSize']
    },
    midpoints: {
        sources: {
            vertex: require('viz-app/shaders/midpoint.vertex.glsl'),
            fragment: require('viz-app/shaders/midpoint.fragment.glsl')
        },
        attributes: ['curPos'],
        camera: 'mvp',
        uniforms: []
    },
    fullscreen: {
        sources: {
            vertex: require('viz-app/shaders/fullscreen.vertex.glsl'),
            fragment: require('viz-app/shaders/fullscreen.fragment.glsl')
        },
        attributes: ['vertexPosition'],
        camera: 'mvp',
        uniforms: ['flipTexture'],
        textures: ['uSampler']
    },
    fullscreenDark: {
        sources: {
            vertex: require('viz-app/shaders/fullscreendark.vertex.glsl'),
            fragment: require('viz-app/shaders/fullscreendark.fragment.glsl')
        },
        attributes: ['vertexPosition'],
        camera: 'mvp',
        uniforms: ['flipTexture'],
        textures: ['uSampler']
    }
};

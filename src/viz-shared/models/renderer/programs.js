export const programs = {
    'edgeculled': {
        'sources': {
            'vertex': require('../../shaders/edgeculled.vertex.glsl'),
            'fragment': require('../../shaders/edgeculled.fragment.glsl')
        },
        'attributes': ['edgeColor', 'curPos'],
        'camera': 'mvp',
        'uniforms': ['edgeOpacity']
    },
    'edgehighlight': {
        'sources': {
            'vertex': require('../../shaders/edgehighlighted.vertex.glsl'),
            'fragment': require('../../shaders/edgehighlighted.fragment.glsl')
        },
        'attributes': ['curPos'],
        'camera': 'mvp',
        'uniforms': []
    },
    'arrow': {
        'sources': {
            'vertex': require('../../shaders/arrow.vertex.glsl'),
            'fragment': require('../../shaders/arrow.fragment.glsl')
        },
        'attributes': ['startPos', 'endPos', 'normalDir', 'arrowColor', 'pointSize'],
        'camera': 'mvp',
        'uniforms': ['zoomScalingFactor', 'maxPointSize', 'maxScreenSize', 'maxCanvasSize', 'edgeOpacity']
    },
    'arrowhighlight': {
        'sources': {
            'vertex': require('../../shaders/arrowhighlighted.vertex.glsl'),
            'fragment': require('../../shaders/arrowhighlighted.fragment.glsl')
        },
        'attributes': ['startPos', 'endPos', 'normalDir', 'pointSize', 'arrowColor'],
        'camera': 'mvp',
        'uniforms': ['zoomScalingFactor', 'maxPointSize', 'maxScreenSize', 'maxCanvasSize']
    },
    'edges': {
        'sources': {
            'vertex': require('../../shaders/edge.vertex.glsl'),
            'fragment': require('../../shaders/edge.fragment.glsl')
        },
        'attributes': ['edgeColor', 'curPos'],
        'camera': 'mvp',
        'uniforms': []
    },
    'midedges': {
        'sources': {
            'vertex': require('../../shaders/midedge.vertex.glsl'),
            'fragment': require('../../shaders/midedge.fragment.glsl')
        },
        'attributes': ['curPos'],
        'camera': 'mvp',
        'uniforms': []
    },
    'midedgeculled': {
        'sources': {
            'vertex': require('../../shaders/midedgeculled.vertex.glsl'),
            'fragment': require('../../shaders/midedgeculled.fragment.glsl')
        },
        'attributes': ['curPos', 'edgeColor', 'startPos', 'endPos'],
        'camera': 'mvp',
        'uniforms': ['edgeOpacity', 'isOpaque']
    },
    'pointculled': {
        'sources': {
            'vertex': require('../../shaders/pointculled.vertex.glsl'),
            'fragment': require('../../shaders/pointculled.fragment.glsl')
        },
        'attributes': ['curPos', 'pointSize', 'pointColor'],
        'camera': 'mvp',
        'uniforms': ['fog', 'stroke', 'zoomScalingFactor', 'maxPointSize', 'minPointSize', 'pointOpacity']
    },
    'pointhighlight': {
        'sources': {
            'vertex': require('../../shaders/pointhighlighted.vertex.glsl'),
            'fragment': require('../../shaders/pointhighlighted.fragment.glsl')
        },
        'attributes': ['curPos', 'pointSize', 'pointColor'],
        'camera': 'mvp',
        'uniforms': ['fog', 'stroke', 'zoomScalingFactor', 'maxPointSize', 'minPointSize', 'pointOpacity']
    },
    'points': {
        'sources': {
            'vertex': require('../../shaders/point.vertex.glsl'),
            'fragment': require('../../shaders/point.fragment.glsl')
        },
        'attributes': ['curPos', 'pointSize', 'pointColor'],
        'camera': 'mvp',
        'uniforms': ['zoomScalingFactor', 'textureScalingFactor','maxPointSize']
    },
    'midpoints': {
        'sources': {
            'vertex': require('../../shaders/midpoint.vertex.glsl'),
            'fragment': require('../../shaders/midpoint.fragment.glsl')
        },
        'attributes': ['curPos'],
        'camera': 'mvp',
        'uniforms': []
    },
    'fullscreen': {
        'sources': {
            'vertex': require('../../shaders/fullscreen.vertex.glsl'),
            'fragment': require('../../shaders/fullscreen.fragment.glsl')
        },
        'attributes': ['vertexPosition'],
        'camera': 'mvp',
        'uniforms': ['flipTexture'],
        'textures': ['uSampler']
    },
    'fullscreenDark': {
        'sources': {
            'vertex': require('../../shaders/fullscreendark.vertex.glsl'),
            'fragment': require('../../shaders/fullscreendark.fragment.glsl')
        },
        'attributes': ['vertexPosition'],
        'camera': 'mvp',
        'uniforms': ['flipTexture'],
        'textures': ['uSampler']
    }
};

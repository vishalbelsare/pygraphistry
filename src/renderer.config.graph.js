'use strict';

/** @module RenderConfig/Graph */

var fs = require('fs');

/**
 * Configuration for graph rendering pipeline
 * @type RenderPipeline
 */
module.exports = {
    'options': {
        'enable': [['BLEND'], ['DEPTH_TEST']],
        'disable': [['CULL_FACE']],
        'blendFuncSeparate': [['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'ONE', 'ONE']],
        'blendEquationSeparate': [['FUNC_ADD', 'FUNC_ADD']],
        'depthFunc': [['LEQUAL']],
        'clearColor': [[0, 0, 0, 0.0]],
        'lineWidth': [[2]]
    },

    'camera': {
        'type': '2d',
        'init': [{'top': -1, 'left': 0, 'bottom': 0, 'right': 1}]
    },

    'programs': {
        'edgeculled': {
            'sources': {
                'vertex': fs.readFileSync('./src/shaders/graph/edgeculled.vertex.glsl', 'utf8').toString('ascii'),
                'fragment': fs.readFileSync('./src/shaders/graph/edgeculled.fragment.glsl', 'utf8').toString('ascii')
            },
            'attributes': ['edgeColor', 'curPos'],
            'camera': 'mvp',
            'uniforms': []
        },
        'edges': {
            'sources': {
                'vertex': fs.readFileSync('./src/shaders/graph/edge.vertex.glsl', 'utf8').toString('ascii'),
                'fragment': fs.readFileSync('./src/shaders/graph/edge.fragment.glsl', 'utf8').toString('ascii')
            },
            'attributes': ['curPos'],
            'camera': 'mvp',
            'uniforms': []
        },
        'midedges': {
            'sources': {
                'vertex': fs.readFileSync('./src/shaders/graph/midedge.vertex.glsl', 'utf8').toString('ascii'),
                'fragment': fs.readFileSync('./src/shaders/graph/midedge.fragment.glsl', 'utf8').toString('ascii')
            },
            'attributes': ['curPos'],
            'camera': 'mvp',
            'uniforms': []
        },
        'midedgeculled': {
            'sources': {
                'vertex': fs.readFileSync('./src/shaders/graph/midedgeculled.vertex.glsl', 'utf8').toString('ascii'),
                'fragment': fs.readFileSync('./src/shaders/graph/midedgeculled.fragment.glsl', 'utf8').toString('ascii')
            },
            'attributes': ['curPos'],
            'camera': 'mvp',
            'uniforms': []
        },
        'midedgestextured': {
            'sources': {
                'vertex': fs.readFileSync('./src/shaders/graph/midedge-textured.vertex.glsl', 'utf8').toString('ascii'),
                'fragment': fs.readFileSync('./src/shaders/graph/midedge-textured.fragment.glsl', 'utf8').toString('ascii')
            },
            'attributes': ['curPos', 'aColorCoord'],
            'sampler': ['uSampler'],
            'camera': 'mvp',
            'uniforms': []
        },
        'pointculled': {
            'sources': {
                'vertex': fs.readFileSync('./src/shaders/graph/pointculled.vertex.glsl', 'utf8').toString('ascii'),
                'fragment': fs.readFileSync('./src/shaders/graph/pointculled.fragment.glsl', 'utf8').toString('ascii')
            },
            'attributes': ['pointIndex', 'curPos', 'pointSize', 'pointColor', 'fog'],
            'camera': 'mvp',
            'uniforms': ['highlightedPoint']
        },
        'points': {
            'sources': {
                'vertex': fs.readFileSync('./src/shaders/graph/point.vertex.glsl', 'utf8').toString('ascii'),
                'fragment': fs.readFileSync('./src/shaders/graph/point.fragment.glsl', 'utf8').toString('ascii')
            },
            'attributes': ['curPos', 'pointSize', 'pointColor'],
            'camera': 'mvp',
            'uniforms': []
        },
        'midpoints': {
            'sources': {
                'vertex': fs.readFileSync('./src/shaders/graph/midpoint.vertex.glsl', 'utf8').toString('ascii'),
                'fragment': fs.readFileSync('./src/shaders/graph/midpoint.fragment.glsl', 'utf8').toString('ascii')
            },
            'attributes': ['curPos'],
            'camera': 'mvp',
            'uniforms': []
        }
    },

    'textures': {
        'pointHitmap': {}
    },

    'models': {
        'springsPos': {
            'curPos': {
                'type': 'FLOAT',
                'count': 2,
                'offset': 0,
                'stride': 8,
                'normalize': false
            }
        },
        'midSpringsPos': {
            'curPos': {
                'type': 'FLOAT',
                'count': 2,
                'offset': 0,
                'stride': 8,
                'normalize': false
            }
        },
        'midSpringsColorCoord': {
            'colorCoord': {
                'type': 'FLOAT',
                'count': 2,
                'offset': 0,
                'stride': 8,
                'normalize': false
            }
        },
        'curPoints': {
            'curPos': {
                'type': 'FLOAT',
                'count': 2,
                'offset': 0,
                'stride': 8,
                'normalize': false
            }
        },
        'pointSizes': {
            'pointSize':  {
                'type': 'UNSIGNED_BYTE',
                'count': 1,
                'offset': 0,
                'stride': 0,
                'normalize': false
            }
        },
        'edgeColors': {
            'edgeColor':  {
                'type': 'UNSIGNED_BYTE',
                'count': 4,
                'offset': 0,
                'stride': 0,
                'normalize': true
            }
        },
        'pointColors': {
            'pointColor':  {
                'type': 'UNSIGNED_BYTE',
                'count': 4,
                'offset': 0,
                'stride': 0,
                'normalize': true
            }
        },
        'curMidPoints': {
            'curPos': {
                'type': 'FLOAT',
                'count': 2,
                'offset': 0,
                'stride': 8,
                'normalize': false
            }
        },
        'vertexIndices': {
            'pointColor': {

                'datasource': 'VERTEX_INDEX',

                'type': 'UNSIGNED_BYTE',
                'count': 4,
                'offset': 0,
                'stride': 0,
                'normalize': true
            }
        },
        'highlightedPoint': {
            'isHighlighted':  {

                'datasource': 'LOCAL',
                'localName': 'highlights',

                'type': 'FLOAT',
                'count': 1,
                'offset': 0,
                'stride': 0,
                'normalize': false
            }
        }
    },

    'scene': {
        'items': {
            'edgeculled': {
                'program': 'edgeculled',
                'bindings': {
                    'curPos': ['springsPos', 'curPos'],
                    'edgeColor': ['edgeColors', 'edgeColor']
                },
                'drawType': 'LINES',
                'glOptions': {}
            },
            'edges': {
                'program': 'edges',
                'bindings': {
                    'curPos': ['springsPos', 'curPos'],
                },
                'drawType': 'LINES',
                'glOptions': {}
            },
            'pointculled': {
                'program': 'pointculled',
                'bindings': {
                    'curPos':       ['curPoints', 'curPos'],
                    'pointSize':    ['pointSizes', 'pointSize'],
                    'pointColor':   ['pointColors', 'pointColor'],
                    'isHighlighted':   ['highlightedPoint', 'isHighlighted']
                },
                'uniforms': {
                    'fog': { 'uniformType': '1f', 'values': [10.0] }
                },
                'drawType': 'POINTS',
                'glOptions': {},
                //'renderTarget': 'pointHitmap',
            },
            'pointpickingScreen': {
                'program': 'pointculled',
                'bindings': {
                    'curPos':       ['curPoints', 'curPos'],
                    'pointSize':    ['pointSizes', 'pointSize'],
                    'pointColor':   ['vertexIndices', 'pointColor'],
                    'isHighlighted':   ['highlightedPoint', 'isHighlighted']
                },
                'uniforms': {
                    'fog': { 'uniformType': '1f', 'values': [0.0] }
                },
                'drawType': 'POINTS',
                'glOptions': {},
            },
            'pointpicking': {
                'program': 'pointculled',
                'bindings': {
                    'curPos':       ['curPoints', 'curPos'],
                    'pointSize':    ['pointSizes', 'pointSize'],
                    'pointColor':   ['vertexIndices', 'pointColor'],
                    'isHighlighted':   ['highlightedPoint', 'isHighlighted']
                },
                'uniforms': {
                    'fog': { 'uniformType': '1f', 'values': [0.0] }
                },
                'drawType': 'POINTS',
                'glOptions': {},
                'renderTarget': 'pointHitmap',
            },
            'points': {
                'program': 'points',
                'bindings': {
                    'curPos':       ['curPoints', 'curPos'],
                    'pointSize':    ['pointSizes', 'pointSize'],
                    'pointColor':   ['pointColors', 'pointColor']
                },
                'drawType': 'POINTS',
                'glOptions': {}
            },
            'midpoints': {
                'program': 'midpoints',
                'bindings': {
                    'curPos': ['curMidPoints', 'curPos']
                },
                'drawType': 'POINTS',
                'glOptions': {}
            },
            'midedges': {
                'program': 'midedges',
                'bindings': {
                    'curPos': ['midSpringsPos', 'curPos']
                },
                'drawType': 'LINES',
                'glOptions': {}
            },
            'midedgeculled': {
                'program': 'midedgeculled',
                'bindings': {
                    'curPos': ['midSpringsPos', 'curPos'],
                },
                'drawType': 'LINES',
                'glOptions': {}
            }
        },

        'render': ['pointpicking', 'midedgeculled']
    }
};

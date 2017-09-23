import { textures } from './textures';
import { STROKE_WIDTH } from './enum';

const hitmapScale = textures.hitmap.uniforms.textureScalingFactor;
const hitmapDownScale = textures.pointHitmapDownsampled.uniforms.textureScalingFactor;

const pointCulledUniforms = {
    'pointOpacity': { 'uniformType': '1f', 'defaultValues': [0.8] },
    'stroke': { 'uniformType': '1f', 'defaultValues': [-STROKE_WIDTH] },
    'zoomScalingFactor': { 'uniformType': '1f', 'defaultValues': [1.0] },
    'maxPointSize': { 'uniformType': '1f', 'defaultValues': [50.0] },
    'minPointSize': { 'uniformType': '1f', 'defaultValues': [8.0] }
};

const pickingGlOpts = {
    'clearColor': [[1, 1, 1, 0.0]],
    'blendFuncSeparate': [['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'ONE', 'ONE']],
    'blendEquationSeparate': [['FUNC_ADD', 'FUNC_ADD']],
};

export const items = {
    'uberdemoedges' : {
        'program': 'midedgeculled',
        'triggers': ['renderSceneFull'],
        'bindings': {
            'curPos': ['midSpringsPos', 'curPos'],
            'edgeColor': ['midEdgeColors', 'midEdgeColor'],
            'startPos': ['midSpringsStarts', 'startPos'],
            'endPos': ['midSpringsEnds', 'endPos']
        },
        'otherBuffers': {
            'logicalEdges': ['logicalEdges', 'curIdx'],
            'edgeSeqLens': ['edgeSeqLens', 'edgeSeqLen'],
            'forwardsEdgeToUnsortedEdge': ['forwardsEdgeToUnsortedEdge', 'forwardsEdgeToUnsortedEdge'],
            'edgeColor': ['edgeColors', 'edgeColor'],
            'startPos': ['midSpringsStarts', 'startPos'],
            'endPos': ['midSpringsEnds', 'endPos']
        },
        'uniforms': {
            'edgeOpacity': { 'uniformType': '1f', 'defaultValues': [0.2] },
            'isOpaque': { 'uniformType': '1f', 'defaultValues': [0.0] }
        },
        'drawType': 'LINES',
        'glOptions': {}
    },
    'radialaxes': {
        'program': 'radialaxes',
        'triggers': ['renderSceneFast', 'renderSceneFull'],
        'bindings': {
            'aPos': ['radialAxes', 'pos'],
            'aCenter': ['radialAxes', 'center'],
            'aRadius': ['radialAxes', 'radius'],
            'aFlags': ['radialAxes', 'flags'],
        },
        'uniforms': {
            'stroke': { 'uniformType': '1f', 'defaultValues': [STROKE_WIDTH * .5]},
            'maxCanvasSize': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'maxScreenSize': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'edgeZoomScalingFactor': { 'uniformType': '1f', 'defaultValues': [1.0] },
        },
        'drawType': 'TRIANGLES'
    },
    'midedgeculled' : {
        'program': 'midedgeculled',
        'triggers': ['renderSceneFull'],
        'bindings': {
            'curPos': ['midSpringsPos', 'curPos'],
            'edgeColor': ['midEdgesColors', 'midEdgeColor'],
            'startPos': ['midSpringsStarts', 'startPos'],
            'endPos': ['midSpringsEnds', 'endPos']
        },
        'otherBuffers': {
            'logicalEdges': ['logicalEdges', 'curIdx'],
            'forwardsEdgeToUnsortedEdge': ['forwardsEdgeToUnsortedEdge', 'forwardsEdgeToUnsortedEdge'],
            'edgeColor': ['edgeColors', 'edgeColor'],
            'startPos': ['midSpringsStarts', 'startPos'],
            'endPos': ['midSpringsEnds', 'endPos']
        },
        'uniforms': {
            'edgeOpacity': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'isOpaque': { 'uniformType': '1f', 'defaultValues': [0.0] }
        },
        'drawType': 'LINES',
        'glOptions': {}
    },
    'edgeselected' : {
        'program': 'edgeselected',
        'triggers': ['highlightDark'],
        'bindings': {
            'curPos': ['selectedMidSpringsPos', 'curPos'],
            'edgeColor': ['selectedMidEdgesColors', 'midEdgeColor'],
            'startPos': ['selectedMidSpringsStarts', 'startPos'],
            'endPos': ['selectedMidSpringsEnds', 'endPos']
        },
        'otherBuffers': {
            'logicalEdges': ['logicalEdges', 'curIdx'],
            'forwardsEdgeToUnsortedEdge': ['forwardsEdgeToUnsortedEdge', 'forwardsEdgeToUnsortedEdge'],
            'edgeColor': ['selectedMidEdgesColors', 'midEdgeColor'],
            'startPos': ['selectedMidSpringsStarts', 'startPos'],
            'endPos': ['selectedMidSpringsEnds', 'endPos']
        },
        'uniforms': {
            'isOpaque': { 'uniformType': '1f', 'defaultValues': [0.0] }
        },
        'drawType': 'LINES',
        'glOptions': {}
    },
    'edgehighlight': {
        'program': 'edgehighlight',
        'triggers': ['highlight', 'highlightDark'],
        'bindings': {
            'curPos': ['highlightedEdgesPos', 'curPos']
        },
        'drawType': 'LINES',
        'glOptions': {
            'depthFunc': [['LESS']]
        }
    },
    'arrowculled' : {
        'program': 'arrow',
        'triggers': ['renderSceneFull'],
        'bindings': {
            'startPos': ['arrowStartPos', 'curPos'],
            'endPos': ['arrowEndPos', 'curPos'],
            'normalDir': ['arrowNormalDir', 'normalDir'],
            'arrowColor': ['arrowColors', 'arrowColor'],
            'pointSize': ['arrowPointSizes', 'pointSize'],
        },
        'uniforms': {
            'edgeOpacity': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'zoomScalingFactor': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'maxPointSize': { 'uniformType': '1f', 'defaultValues': [50.0] },
            'maxScreenSize': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'maxCanvasSize': { 'uniformType': '1f', 'defaultValues': [1.0] }
        },
        'drawType': 'TRIANGLES',
        'glOptions': {
            //'depthFunc': [['LESS']]
        }
    },
    'arrowselected' : {
        'program': 'arrow',
        'triggers': ['highlightDark'],
        'bindings': {
            'startPos': ['selectedArrowStartPos', 'curPos'],
            'endPos': ['selectedArrowEndPos', 'curPos'],
            'normalDir': ['selectedArrowNormalDir', 'normalDir'],
            'arrowColor': ['selectedArrowColors', 'arrowColor'],
            'pointSize': ['selectedArrowPointSizes', 'pointSize'],
        },
        'uniforms': {
            'edgeOpacity': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'zoomScalingFactor': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'maxPointSize': { 'uniformType': '1f', 'defaultValues': [50.0] },
            'maxScreenSize': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'maxCanvasSize': { 'uniformType': '1f', 'defaultValues': [1.0] }
        },
        'drawType': 'TRIANGLES',
        'glOptions': {
            //'depthFunc': [['LESS']]
        }
    },
    'arrowhighlight' : {
        'program': 'arrowhighlight',
        'triggers': ['highlight', 'highlightDark'],
        'bindings': {
            'startPos': ['highlightedArrowStartPos', 'curPos'],
            'endPos': ['highlightedArrowEndPos', 'curPos'],
            'normalDir': ['highlightedArrowNormalDir', 'normalDir'],
            'arrowColor': ['highlightedArrowPointColors', 'arrowColor'],
            'pointSize': ['highlightedArrowPointSizes', 'pointSize'],
        },
        'uniforms': {
            'zoomScalingFactor': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'maxPointSize': { 'uniformType': '1f', 'defaultValues': [50.0] },
            'maxScreenSize': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'maxCanvasSize': { 'uniformType': '1f', 'defaultValues': [1.0] }
        },
        'drawType': 'TRIANGLES',
        'glOptions': {
            //'depthFunc': [['LESS']]
        }
    },
    'edgepicking': {
        'program': 'midedgeculled',
        'triggers': ['picking'],
        'bindings': {
            'curPos': ['midSpringsPos', 'curPos'],
            'startPos': ['midSpringsStarts', 'startPos'],
            'endPos': ['midSpringsEnds', 'endPos'],
            'edgeColor': ['edgeIndices', 'edgeColor']
        },
        'uniforms': {
            'edgeOpacity': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'isOpaque': { 'uniformType': '1f', 'defaultValues': [1.0] }
        },
        'drawType': 'LINES',
        'glOptions': pickingGlOpts,
        'renderTarget': 'hitmap',
        'readTarget': true
    },
    'pointculled': {
        'program': 'pointculled',
        'triggers': ['renderSceneFast', 'renderSceneFull'],
        'bindings': {
            'curPos':       ['curPoints', 'curPos'],
            'pointSize':    ['pointSizes', 'pointSize'],
            'pointColor':   ['pointColors', 'pointColor'],
        },
        'uniforms': pointCulledUniforms,
        'drawType': 'POINTS',
        'glOptions': {},
    },
    'pointculledoutline': {
        'program': 'pointculled',
        'triggers': ['renderSceneFull'],
        'bindings': {
            'curPos':       ['curPoints', 'curPos'],
            'pointSize':    ['pointSizes', 'pointSize'],
            'pointColor':   ['pointColors', 'pointColor']
        },
        'uniforms': { ...pointCulledUniforms, ...{
            'stroke': { 'uniformType': '1f', 'defaultValues': [STROKE_WIDTH]}
        }},
        'drawType': 'POINTS',
        'glOptions': {},
    },
    'pointselected': {
        'program': 'pointselected',
        'triggers': ['highlightDark'],
        'bindings': {
            'curPos':       ['selectedCurPoints', 'curPos'],
            'pointSize':    ['selectedPointSizes', 'pointSize'],
            'pointColor':   ['selectedPointColors', 'pointColor'],
        },
        'uniforms': pointCulledUniforms,
        'drawType': 'POINTS',
        'glOptions': {},
    },
    'pointselectedoutline': {
        'program': 'pointselected',
        'triggers': ['highlightDark'],
        'bindings': {
            'curPos':       ['selectedCurPoints', 'curPos'],
            'pointSize':    ['selectedPointSizes', 'pointSize'],
            'pointColor':   ['selectedPointColors', 'pointColor'],
        },
        'uniforms': { ...pointCulledUniforms, ...{
            'stroke': { 'uniformType': '1f', 'defaultValues': [STROKE_WIDTH]}
        }},
        'drawType': 'POINTS',
        'glOptions': {},
    },
    'pointhighlight': {
        'program': 'pointhighlight',
        'triggers': ['highlight', 'highlightDark'],
        'bindings': {
            'curPos':       ['highlightedPointsPos', 'curPos'],
            'pointSize':    ['highlightedPointsSizes', 'pointSize'],
            'pointColor':   ['highlightedPointsColors', 'pointColor'],
        },
        'otherBuffers': {
            'forwardsEdgeStartEndIdxs': ['forwardsEdgeStartEndIdxs', 'curIdx'],
        },
        'uniforms': pointCulledUniforms,
        'drawType': 'POINTS',
        'glOptions': {}
    },
    'pointhighlightoutline': {
        'program': 'pointhighlight',
        'triggers': ['highlight', 'highlightDark'],
        'bindings': {
            'curPos':       ['highlightedPointsPos', 'curPos'],
            'pointSize':    ['highlightedPointsSizes', 'pointSize'],
            'pointColor':   ['highlightedPointsColors', 'pointColor'],
        },
        'uniforms': { ...pointCulledUniforms, ...{
            'stroke': { 'uniformType': '1f', 'defaultValues': [STROKE_WIDTH]}
        }},
        'drawType': 'POINTS',
        'glOptions': {},
    },
    'uberpointculled': {
        'program': 'pointculled',
        'triggers': ['renderSceneFast', 'renderSceneFull'],
        'bindings': {
            'curPos':       ['curPoints', 'curPos'],
            'pointSize':    ['pointSizes', 'pointSize'],
            'pointColor':   ['pointColors', 'pointColor'],
        },
        'uniforms': {
            'pointOpacity': { 'uniformType': '1f', 'defaultValues': [0.4] },
            'stroke': { 'uniformType': '1f', 'defaultValues': [-STROKE_WIDTH] },
            'zoomScalingFactor': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'maxPointSize': { 'uniformType': '1f', 'defaultValues': [50.0] },
            'minPointSize': { 'uniformType': '1f', 'defaultValues': [8.0] }
        },
        'drawType': 'POINTS',
        'glOptions': {},
    },
    'pointculledtexture': {
        'program': 'pointculled',
        'triggers': ['marquee'],
        'bindings': {
            'curPos':       ['curPoints', 'curPos'],
            'pointSize':    ['pointSizes', 'pointSize'],
            'pointColor':   ['pointColors', 'pointColor']
        },
        'uniforms': pointCulledUniforms,
        'drawType': 'POINTS',
        'glOptions': {'clearColor': [[1, 1, 1, 0.0]] },
        'renderTarget': 'pointTexture',
        'readTarget': true,
    },
    'pointoutlinetexture': {
        'program': 'pointculled',
        'triggers': ['marquee'],
        'bindings': {
            'curPos':       ['curPoints', 'curPos'],
            'pointSize':    ['pointSizes', 'pointSize'],
            'pointColor':   ['pointColors', 'pointColor'],
        },
        'uniforms': { ...pointCulledUniforms, ...{
            'stroke': { 'uniformType': '1f', 'defaultValues': [STROKE_WIDTH]}
        }},
        'drawType': 'POINTS',
        'glOptions': {'clearColor': [[1, 1, 1, 0.0]] },
        'renderTarget': 'pointTexture',
        'readTarget': false
    },
    'pointpicking': {
        'program': 'points',
        'triggers': ['picking'],
        'bindings': {
            'curPos':       ['curPoints', 'curPos'],
            'pointSize':    ['pointSizes', 'pointSize'],
            'pointColor':   ['vertexIndices', 'pointColor']
        },
        'uniforms': {
            'zoomScalingFactor': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'textureScalingFactor': { 'uniformType': '1f', 'defaultValues': [hitmapScale]},
            'maxPointSize': { 'uniformType': '1f', 'defaultValues': [50.0] }
        },
        'drawType': 'POINTS',
        'glOptions': pickingGlOpts,
        'renderTarget': 'hitmap',
        'readTarget': true,
    },
    'pointsampling': {
        'program': 'points',
        'triggers': ['picking'],
        'bindings': {
            'curPos':       ['curPoints', 'curPos'],
            'pointSize':    ['pointSizes', 'pointSize'],
            'pointColor':   ['vertexIndices', 'pointColor']
        },
        'uniforms': {
            'zoomScalingFactor': { 'uniformType': '1f', 'defaultValues': [1.0] },
            'textureScalingFactor': { 'uniformType': '1f', 'defaultValues': [hitmapDownScale]},
            'maxPointSize': { 'uniformType': '1f', 'defaultValues': [50.0] }
        },
        'drawType': 'POINTS',
        'glOptions': pickingGlOpts,
        'renderTarget': 'pointHitmapDownsampled',
        'readTarget': true,
    },
    'fullscreen': {
        'program': 'fullscreen',
        'triggers': ['highlight'],
        'bindings': {
            'vertexPosition': ['fullscreenCoordinates', 'vertexPosition']
        },
        'textureBindings': {
            'uSampler': 'steadyStateTexture'
        },
        'uniforms': {
            'flipTexture': { 'uniformType': '1f', 'defaultValues': [1.0] }
        },
        'drawType': 'TRIANGLES',
        'glOptions': {}
    },
    'fullscreenDark': {
        'program': 'fullscreenDark',
        'triggers': ['highlightDark'],
        'bindings': {
            'vertexPosition': ['fullscreenCoordinates', 'vertexPosition']
        },
        'textureBindings': {
            'uSampler': 'steadyStateTexture'
        },
        'uniforms': {
            'flipTexture': { 'uniformType': '1f', 'defaultValues': [1.0] }
        },
        'drawType': 'TRIANGLES',
        'glOptions': {}
    },
    // Because we can't tell renderer to make a texture unless we write to it in an item
    // TODO: Add this functionality and kill fullscreenDummy
    'fullscreenDummy': {
        'program': 'fullscreen',
        'triggers': [],
        'bindings': {
            'vertexPosition': ['fullscreenCoordinates', 'vertexPosition']
        },
        'textureBindings': {
            'uSampler': 'steadyStateTexture'
        },
        'uniforms': {
            'flipTexture': { 'uniformType': '1f', 'defaultValues': [1.0] }
        },
        'drawType': 'TRIANGLES',
        'glOptions': {},
        'renderTarget': 'steadyStateTexture',
        'readTarget': true
    }
};

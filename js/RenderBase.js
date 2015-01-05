// Base class for Render* renderer objects
// Returns a sealed Object with all fields required of a Render* object declared but set to null

'use strict';

var _ = require('underscore');

//[string] -> Renderer
function create(clglBufferNames) {
    var renderer = {
        gl: null,
        document: null,
        canvas: null,

        buffers: _.extend({
            curPoints: null,
            springs: null,
            curMidPoints: null,
            midSprings: null,
            midSpringsColorCoord: null
        }, _.object((clglBufferNames||[]).map(function (name) { return [name, null]; }))),

        programs: {
            points: null,
            edges: null,
            midpoints: null,
            midedges: null,
            midedgestextured: null
        },

        elementsPerPoint: null,
        numPoints: null,
        numEdges: null,
        numMidPoints: null,
        numMidEdges: null,
        colorTexture: null,

        setCamera2d: null,
        createBuffer: null,
        render: null,
        createProgram: null,
        setVisible: null,
        isVisible : null,
        setColorMap: null,
        finish: null,

        visible: {
            points: null,
            edges: null,
            midpoints: null,
            midedges: null
        },
    };


    Object.seal(renderer.buffers);
    Object.seal(renderer.programs);
    Object.seal(renderer.visible);
    Object.seal(renderer);

    return renderer;
}


module.exports = {
    "create": create
};

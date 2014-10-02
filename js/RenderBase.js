// Base class for Render* renderer objects
// Returns a sealed Object with all fields required of a Render* object declared but set to null

'use strict';

function create() {
    var renderer = {
        gl: null,
        document: null,
        canvas: null,

        buffers: {
            curPoints: null,
            pointSizes: null,
            pointColors: null,
            springs: null,
            curMidPoints: null,
            midSprings: null,
            midSpringsColorCoord: null
        },

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

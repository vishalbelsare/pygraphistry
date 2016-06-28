'use strict';
// Base class for Render* renderer objects
// Returns a sealed Object with all fields required of a Render* object declared but set to null

/** @typedef {Object} Renderer
 * @property gl
 * @property document
 * @property canvas
 * @property {{curPoints: null, springs: null, curMidPoints: null, midSprings: null, midSpringsColorCoord: null}} buffers
 * @property {{points: null, edges: null, midpoints: null, midedges: null, midedgestextured: null}} programs
 * @property {Number} elementsPerPoint
 * @property {Number} numPoints
 * @property {Number} numEdges
 * @property {Number} numMidPoints
 * @property {Number} numMidEdges
 * @property colorTexture
 * @property {Function} setCamera2d
 * @property {Function} createBuffer
 * @property {Function} render
 * @property {Function} createProgram
 * @property {Function} setVisible
 * @property {Function} isVisible
 * @property {Function} setColorMap
 * @property {Function} finish
 * @property {{points: null, edges: null, midpoints: null, midedges: null}} visible
 */

/**
 * @returns {Renderer}
 */
export function create () {

    const renderer = {
        gl: null,
        document: null,
        canvas: null,

        buffers: {
            curPoints: null,
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
        finish: null,

        visible: {
            points: null,
            edges: null,
            midpoints: null,
            midedges: null
        }
    };


    Object.seal(renderer.buffers);
    Object.seal(renderer.programs);
    Object.seal(renderer.visible);
    Object.seal(renderer);

    return renderer;
}

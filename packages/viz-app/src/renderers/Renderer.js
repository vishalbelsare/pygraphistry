import { Observable } from 'rxjs';
import { logger as commonLogger } from '@graphistry/common';
const logger = commonLogger.createLogger('viz-worker', 'viz-shared/renderers/Renderer.js');

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

export class Renderer {
    constructor(document) {
        // Object.seal(this);
        Object.seal(this.visible);
        Object.seal(this.buffers);
        Object.seal(this.programs);
        this.document = document;
    }

    gl = null;
    document = null;
    canvas = null;

    buffers = {
        curPoints: null,
        springs: null,
        curMidPoints: null,
        midSprings: null,
        midSpringsColorCoord: null
    };

    programs = {
        points: null,
        edges: null,
        midpoints: null,
        midedges: null,
        midedgestextured: null
    };

    elementsPerPoint = 2;
    numPoints = 0;
    numEdges = 0;
    numMidPoints = 0;
    numMidEdges = 0;
    colorTexture = null;

    visible = {
        points: null,
        edges: null,
        midpoints: null,
        midedges: null
    };

    setCamera2d() {
        return this;
    }

    createBuffer(data, name, isNum = typeof data === 'number') {
        logger.trace(
            'Creating (fake) null renderer buffer of type %s. Constructor: %o',
            typeof data,
            (data || {}).constructor
        );
        return Observable.of({
            buffer: null,
            gl: null,
            len: isNum ? data : data.byteLength,
            data: isNum ? null : data
        }).toPromise();
    }

    render() {
        return Observable.of(this);
    }

    createProgram() {
        return undefined;
    }

    /**
     * Enable or disable the drawing of elements in the scene. Elements are one of: points, edges,
     * midpoints, midedges.
     *
     * @param renderer - the renderer object created with GLRunner.create()
     * @param {Object} visible - An object with keys for 0 or more objects to set the visibility
     * for. Each value should be true or false.
     * @returns the renderer object passed in, with visibility options updated
     */
    setVisible(visible) {
        this.visible = { ...this.visible, ...visible };
        return this;
    }

    /**
     * Determines if the element passed in should be visible in image
     *
     * @param renderer - the renderer object created with GLRunner.create()
     * @param element - the name of the element to check visibility for
     *
     * @returns a boolean value determining if the object should be visible (false by default)
     */
    isVisible(element) {
        // TODO: check the length of the associated buffer to see if it's >0; return false if not.
        return this.visible[element] || false;
    }

    setColorMap() {
        return Observable.of(this);
    }

    finish() {
        return this;
    }
}

/** Cameras are responsible for setting, manipulating and reporting our position in a scene. */

/* global Superconductor */

import * as glMatrix from 'gl-matrix';
const { mat4, vec3, vec4 } = glMatrix;
const debug = require('debug')('graphistry:StreamGL:camera');

//FIXME legacy Superconductor; should merge into normal camera
function Camera3d(argsRaw) {
    //TODO extend
    var args = {
        'position': {x: 0.0, y: 0.0, z: 0.0},
        'rotation': {x: 0.0, y: 0.0, z: 0.0},
        'lens': {fov: 60, near: 1, far: 20, aspect: 1.0}
    };
    argsRaw = argsRaw || {};
    for (var i in argsRaw) {
        for (var j in argsRaw[i]) {
            args[i][j] = argsRaw[i][j];
        }
    }

    // old default position: -this.canvas.width/(2 * 45), this.canvas.height/45, -10
    this.position = args.position;
    this.rotation = args.rotation;

    this.fov = args.lens.fov;
    this.near = args.lens.near;
    this.far = args.lens.far;
    this.aspect = args.lens.aspect;

}

/** Sets the lens and position attributes based off the size of a <canvas> element. */
Camera3d.prototype.fromCanvas = function(canvas) {
    this.lensFromCanvas(canvas);
    this.positionFromCanvas(canvas);
    return this;
};


/** Sets the camera's lens parameters to sane defaults based off a <canvas> element. */
Camera3d.prototype.lensFromCanvas = function(canvas) {
    this.aspect = canvas.width / canvas.height;
    return this;
};


/** Sets the camera's position to a sane default based off a <canvas> element. */
Camera3d.prototype.positionFromCanvas = function(canvas) {
    this.position = {x: -1 * canvas.width/(2 * 45), y: canvas.height/45, z: -10};
    return this;
};


/** Get the 4x4 transformation matrix representing the camera perspective and position */
Camera3d.prototype.getMatrix = function() {

    var projectionMatrix = mat4.create(); //new J3DIMatrix4();
    mat4.perspective(projectionMatrix, glMatrix.toRadian(this.fov), this.aspect, this.near, this.far);

    mat4.translate(projectionMatrix, projectionMatrix, vec3.fromValues(this.position.x, this.position.y, this.position.z));

    mat4.rotateX(projectionMatrix, projectionMatrix, glMatrix.toRadian(this.rotation.x));
    mat4.rotateY(projectionMatrix, projectionMatrix, glMatrix.toRadian(this.rotation.y));
    mat4.rotateZ(projectionMatrix, projectionMatrix, glMatrix.toRadian(this.rotation.z));

    return projectionMatrix;
};


// num * num * num * num *num * num * ({'2d', '3d'} = '2d') => Camera
function Camera2d(left, right, top, bottom, nearPlane, farPlane /*, mode*/) {
    this.zoom = 1;
    this.width = right - left;
    this.height = bottom - top;
    this.center = {
        z: 0,
        x: left + (this.width / 2.0),
        y: top + (this.height / 2.0)
    };
    this.nearPlane = nearPlane;
    this.farPlane = farPlane;
    this.pointScaling = 1.0;
    this.edgeScaling = 1.0;
    this.pixelRatio = 1.0;


    //Always enable 3d
    this.is3d = true;
    this.position = {x: 0.0, y: 0.0, z: 0.0};
    this.rotation = {x: 0.0, y: 0.0, z: 0.0};
    this.fov = 60;
    this.near = 1;
    this.far = 20;
    this.aspect = 1;

}

Camera2d.prototype.setPointScaling = function(value) {
    this.pointScaling = value;
};

Camera2d.prototype.setEdgeScaling = function(value) {
    this.edgeScaling = value;
};

// Set Position given center x/y coordinates, plus optional width and height.
// Only X or Y are strictly necessary. Will compute using provided info,
// and will always maintain aspect ratio if possible.
// args{x, y, height, width} ->
Camera2d.prototype.setPosition = function (args) {
    var centerX = args.x;
    var centerY = args.y;
    var height = args.height;
    var width = args.width;

    // Manual checks against undefined to see if we need to fallback;
    if (centerX === undefined) {
        centerX = this.center.x;
    }

    if (centerY === undefined) {
        centerY = this.center.y;
    }

    var aspectRatio = this.width / this.height;

    if (height === undefined && width === undefined) {
        // Use existing height/width
        height = this.height;
        width = this.width;
    } else if (height === undefined) {
        height = width / aspectRatio;
    } else if (width === undefined) {
        width = height * aspectRatio;
    }

    this.width = width;
    this.height = height;
    this.center.x = centerX;
    this.center.y = centerY;
};

Camera2d.prototype.centerOn = function(left, right, top, bottom) {
    var nwidth = (right - left) * 1.1; // Add 10% horizontal margins
    var nheight = (bottom - top) * 1.2; // Add 20% vertical margins
    // adjust the x axis by -5% to accommodate 10% margin
    left -= nwidth * 0.05;
    // adjust the y axis by -5% as if we only added a 10% vertical margin,
    // so we have an extra 10% of space at the bottom for POI labels
    top -= nheight * 0.05;
    var aspectRatio = this.width / this.height;

    if (nwidth / nheight > aspectRatio) {
        this.width = nwidth;
        this.height = nwidth / aspectRatio;
    } else {
        this.height = nheight;
        this.width = nheight * aspectRatio;
    }
    this.center.x = left + (nwidth * 0.5);
    this.center.y = top + (nheight * 0.5);
};


/** Returns an array of [left, right, top, bottom] that reconstructs the constructor/centerOn arguments.
 * @returns {Array.<number>} an array of [left, right, top, bottom] */
Camera2d.prototype.getBounds = function() {
    var left = this.center.x - this.width / 2.0,
        right = this.center.x + this.width / 2.0,
        top = this.center.y - this.height / 2.0,
        bottom = this.center.y + this.height / 2.0;
    return [left, right, top, bottom];
};


Camera2d.prototype.resize = function(width, height, pixelRatio) {
    var aspectRatio = width / height;
    this.width = aspectRatio * this.height;
    this.pixelRatio = pixelRatio;
    debug('Updating camera dimensions to (%f,%f)', this.width, this.height, this.center);
};


function toRadian (deg) { return deg * Math.PI / 180; }


Camera2d.prototype.getMatrix = function() {
    var projectionMatrix = mat4.create(); //new J3DIMatrix4();

    // Choose arbitrary near and far planes (0, 20)
    // We purposely swap and negate the top and bottom arguments so that the matrix follows
    // HTML-style coordinates (top-left corner at 0,0) vs. than GL coordinates (bottom-left 0,0)
    mat4.ortho(projectionMatrix,
               this.center.x - (this.width / 2), this.center.x + (this.width / 2),
               -this.center.y - (this.height / 2), -this.center.y + (this.height / 2),
               this.nearPlane, this.farPlane);


    //always enable 3d
    mat4.rotateX(projectionMatrix, projectionMatrix, toRadian(this.rotation.x));
    mat4.rotateY(projectionMatrix, projectionMatrix, toRadian(this.rotation.y));
    mat4.rotateZ(projectionMatrix, projectionMatrix, toRadian(this.rotation.z));

//        mat4.perspective(projectionMatrix, toRadian(this.fov), this.aspect, this.near, this.far);

//        mat4.translate(projectionMatrix, projectionMatrix, vec3.fromValues(this.position.x, this.position.y, this.position.z));

    return projectionMatrix;
};


/** Takes an (x,y) world coordinate and returns the translation into device coordinates */
Camera2d.prototype.deviceCoords = function(x, y,optMtx) {
    var matrix = optMtx || this.getMatrix();
    // We need to flip 'y' to match what our shader does
    var worldCoords = vec4.fromValues(x, y, 0, 1);
    var screenCoords = vec4.create();
    vec4.transformMat4(screenCoords, worldCoords, matrix);

    return {
      'x': screenCoords[0],
      'y': screenCoords[1],
      'w': screenCoords[3]
    };
};


/** Given (x,y, w) coordinates in world space, transforms them to coordinates for a canvas */
Camera2d.prototype.canvasCoords = function(x, y, canvas, optMtx) {
    var deviceCoords = this.deviceCoords(x, y, optMtx);
    // We need to flip 'y' because GL puts (0,0) at the bottom-left, and <canvas> puts it at
    // the top-left.
    var canvasCoords = {
        'x': (deviceCoords.x / deviceCoords.w),
        'y': ((deviceCoords.y / deviceCoords.w) * -1.0)
    };

    // Translate x and y from being in [-1, 1] to [0, 1]
    canvasCoords.x = (canvasCoords.x + 1) / 2;
    canvasCoords.y = (canvasCoords.y + 1) / 2;

    canvasCoords.x = canvasCoords.x * canvas.width / this.pixelRatio;
    canvasCoords.y = canvasCoords.y * canvas.height / this.pixelRatio;

    return canvasCoords;
};


/** Given (x,y) coordinates in canvas space, transforms them to coordinates for world space */
//TODO multiply by w somewhere? what about the matrix?
Camera2d.prototype.canvas2ScreenCoords = function (x, y, canvas) {
    return {
        x: this.center.x + this.width * ((x * this.pixelRatio / canvas.width) - 0.5),
        y: this.center.y + this.height * ((y * this.pixelRatio / canvas.height) - 0.5)
    };
};

Camera2d.prototype.canvas2WorldCoords = function (x, y, canvas) {
    var screenCoords = this.canvas2ScreenCoords(x, y, canvas);
    screenCoords.y *= -1.0;
    return screenCoords;
};

Camera2d.prototype.semanticZoom = function(numPoints) {
    // HACK;
    // To zoom in, we use the quadroot of the ratio of
    // points to area to estimate our zoom level. This also has
    // to be adjusted by a constant, which depends on the size of the
    // dataset. We combine constants for small datasets and large datasets
    // using alpha, which is a measure of how "big" a dataset is.

    // HACK so it always uses the first set numPoints.
    if (this.numPoints === undefined) {
        this.numPoints = numPoints;
    }
    numPoints = this.numPoints;

    var pointSizeConstantBig = 1.0;
    var pointSizeConstantSmall = 7.5;
    var numPointsOffset = Math.max(numPoints - 150, 10);
    var alpha = Math.min(1, Math.log(numPointsOffset)/Math.log(10000000));

    var area = this.width * this.height;
    var scalingFactor = Math.sqrt(Math.sqrt(numPoints/area));

    var normalizedScalingFactor =
        scalingFactor * ((1-alpha)*pointSizeConstantSmall + alpha*pointSizeConstantBig);

    return this.pointScaling * normalizedScalingFactor;
};

Camera2d.prototype.semanticZoomEdges = function (numPoints) {

    // HACK so it always uses the first set numPoints.
    if (!this.numPoints) {
        this.numPoints = numPoints;
    }
    numPoints = this.numPoints;

    var pointSizeConstantBig = 2.0;
    var pointSizeConstantSmall = 20;
    var numPointsOffset = Math.max(numPoints - 150, 10);
    var alpha = Math.min(1, Math.log(numPointsOffset)/Math.log(1000000));

    var area = this.width * this.height;
    var scalingFactor = Math.sqrt(Math.sqrt(numPoints/area));

    var normalizedScalingFactor =
        scalingFactor * ((1-alpha)*pointSizeConstantSmall + alpha*pointSizeConstantBig);

    //FIXME coerces NaNs to 1.0 due to degenerate bounding box
    return Math.max(1, Math.min(8, this.edgeScaling * normalizedScalingFactor)) || 1.0;
};

//FIXME should not depend on SC
if(typeof Superconductor !== 'undefined') {
    Superconductor.Cameras = {
        'Camera3d': Camera3d,
        'Camera2d': Camera2d
    };
}

export { Camera2d, Camera3d };

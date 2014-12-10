'use strict';

var defaultControls = {
    physics: {
        charge: -0.000029360001841802474, 
        gravity: 0.020083175556898723, 
        edgeStrength: 4.292198241799153,
        edgeDistance: 0.0000158,
        scalingRatio: 1.0,
        edgeInfluence: 0,
        forceAtlas: false,
        preventOverlap: false,
        strongGravity: false,
        dissuadeHubs: false,
        linLog: false,
    },
    locks: {
        lockPoints: true,
        lockEdges: true,
        lockMidpoints: false,
        lockMidedges: false  
    },
    rendering: {
        points: true,
        edges: false,
        midpoints: false,
        midedges: true  
    }
}

exports.default = defaultControls;


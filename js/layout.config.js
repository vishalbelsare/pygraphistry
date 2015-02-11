'use strict';

var _ = require('underscore');
var SimCL = require('./SimCL.js');
var util = require('./util.js');
var forceAtlas   = require('./forceatlas.js'),
    ForceAtlas2  = require('./forceatlas2.js'),
    GaussSeidel  = require('./gaussseidel2.js'),
    edgeBundling = require('./edgebundling.js'),
    barnesHut    = require('./BarnesHut.js');

var SIMULATION_TIME = 1;

var uberControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: edgeBundling,
            params: {
                charge: -0.000029360001841802474,
                gravity: 0.020083175556898723,
                springStrength: 4.292198241799153,
                springDistance: 0.0000158,
            }
        }
    ],
    locks: {
        lockPoints: true,
        lockEdges: true,
        lockMidpoints: false,
        lockMidedges: false
    },
    global: {
        simulationTime: SIMULATION_TIME, //milliseconds
        dimensions: [1, 1],
        numSplits: 3
    }
}

var gsControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: GaussSeidel,
            params: {
                charge: -0.000029360001841802474,
                gravity: 0.020083175556898723,
                edgeStrength0: 5,
                edgeDistance0: 0.0001,
                edgeStrength1: 1,
                edgeDistance1: 0.01
            }
        }
    ],
    locks: {
        lockPoints: false,
        lockEdges: false,
        lockMidpoints: true,
        lockMidedges: true
    },
    global: {
        simulationTime: SIMULATION_TIME, //milliseconds
        dimensions: [1, 1],
        numSplits: 1
    }
}

function atlasControls(algo1) {
    return {
        simulator: SimCL,
        layoutAlgorithms: [
            {
                algo: algo1,
                params: {
                    gravity: 1,
                    scalingRatio: 1,
                    edgeInfluence: 0,
                    preventOverlap: false,
                    strongGravity: false,
                    dissuadeHubs: false,
                    linLog: false
                }
            }
        ],
        locks: {
            lockPoints: false,
            lockEdges: false,
            lockMidpoints: true,
            lockMidedges: true
        },
        global: {
            simulationTime: SIMULATION_TIME, //milliseconds
            dimensions: [1, 1],
            numSplits: 1
        }
    };
}

var barnesControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: barnesHut,
            params: {
                gravity: 0.020083175556898723,
                scalingRatio: 1.0,
                edgeInfluence: 0,
                preventOverlap: false,
                strongGravity: false,
                dissuadeHubs: false,
                linLog: false
            }
        }
    ],
    locks: {
        lockPoints: false,
        lockEdges: false,
        lockMidpoints: true,
        lockMidedges: true
    },
    global: {
        simulationTime: SIMULATION_TIME, //milliseconds
        dimensions: [1, 1],
        numSplits: 1
    }
}

var controls = {
    'default': uberControls,
    'uber': uberControls,
    'gauss': gsControls,
    'atlas': atlasControls(forceAtlas),
    'atlas2': atlasControls(ForceAtlas2),
    'barneshut': barnesControls
}

function saneControl(control, name) {
    _.each(['simulator', 'layoutAlgorithms', 'locks', 'global'], function (field) {
        if (!(field in control))
            util.die('In control %s, block %s missing', name, field);
    });

    _.each(['lockPoints', 'lockEdges', 'lockMidpoints', 'lockMidedges'], function (field) {
        if (!(field in control.locks))
            util.die('In control %s, lock %s missing', name, field);
    });

    _.each(['simulationTime', 'dimensions'], function (field) {
        if (!(field in control.global))
            util.die('In control %s.global, lock %s missing', name, field);
    });
}

function getControls(controls) {
    _.each(controls, saneControl);
    return controls;
}

exports.controls = getControls(controls);

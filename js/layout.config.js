'use strict';

var _ = require('underscore');
var SimCL = require('./SimCL.js');
var util = require('./util.js');
var forceAtlas = require('./forceatlas.js'),
    gaussSeidel = require('./gaussseidel.js'),
    edgeBundling = require('./edgebundling.js'),
    barnesHut = require('./BarnesHut.js');

var SIMULATION_TIME = 100;

var uberControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: edgeBundling,
            params: {
                charge: -0.000029360001841802474,
                gravity: 0.020083175556898723,
                edgeStrength0: 4.292198241799153,
                edgeDistance0: 0.0000158,
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

var netflowControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: gaussSeidel,
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

var atlasControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: forceAtlas,
            params: {
                gravity: 1,
                scalingRatio: 0.3,
                edgeInfluence: 0,
                preventOverlap: false,
                strongGravity: false,
                dissuadeHubs: false,
                linLog: true
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
    'netflow': atlasControls,
    'atlas': atlasControls,
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

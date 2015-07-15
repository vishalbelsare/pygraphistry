'use strict';

var _ = require('underscore');
var SimCL = require('./SimCL.js');
var log = require('common/log.js');
var ForceAtlas2         = require('./forceatlas2.js'),
    ForceAtlas2Fast     = require('./forceatlas2fast.js'),
    forceAtlasBarnes    = require('./forceatlasbarnes.js'),
    GaussSeidel         = require('./gaussseidel.js'),
    EdgeBundling       = require('./kd-edgebundling.js');

var SIMULATION_TIME = 100;


function Param(type, prettyName, defValue, toSlider, fromSlider) {
    this.type = type;
    this.prettyName = prettyName;
    this.fromSlider = fromSlider || _.identity;
    this.toSlider = toSlider || _.identity;
    this.value = defValue;
}
Param.prototype.toClient = function(name, algoName) {
    return {
        name: name, algoName: algoName,
        prettyName: this.prettyName, type: this.type, value: this.toSlider(this.value),
    };
}
Param.prototype.set = function(v) {
    this.value = this.fromSlider(v);
}

function ContinuousParam(prettyName, value, min, max) {
    var sliderRange = 101; // From 0 to 100
    var range = Math.abs(max - min);
    function fromSlider(val) {
        return min + (val / sliderRange * range);
    };
    function toSlider(val) {
        return (val - min) / range * sliderRange;
    };

    Param.call(this, 'continuous', prettyName, value, toSlider, fromSlider);
}
ContinuousParam.prototype = Object.create(Param.prototype);
ContinuousParam.prototype.constructor = ContinuousParam;

function DiscreteParam(prettyName, value, min, max, step) {
    Param.call(this, 'discrete', prettyName, value);
    this.min = min;
    this.max = max;
    this.step = step;
}
DiscreteParam.prototype = Object.create(Param.prototype);
DiscreteParam.prototype.constructor = DiscreteParam;
DiscreteParam.prototype.toClient = function (name, algoName) {
    var base = Param.prototype.toClient.call(this, name, algoName);
    return _.extend(base, {min: this.min, max: this.max, step: this.step});
}

function BoolParam(name, value) {
    Param.call(this, 'bool', name, value);
}
BoolParam.prototype = Object.create(Param.prototype);
BoolParam.prototype.constructor = BoolParam;

var defaultNumSplits = 8;
var numRenderedSplits = 8;

var uberControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: forceAtlasBarnes,
            params: {
                tau: new ContinuousParam('Precision vs. Speed', 10.0, 1.0, 25.0),
                gravity: new ContinuousParam('Center Magnet', 1.0, 0.01, 100),
                scalingRatio: new ContinuousParam('Expansion Ratio', 1.0, 0.01, 100),
                edgeInfluence: new DiscreteParam('Edge Influence', 0, 0, 5, 1),
                preventOverlap: new BoolParam('Prevent Overlap', false),
                strongGravity: new BoolParam('Compact Layout', false),
                dissuadeHubs: new BoolParam('Dissuade Hubs', false),
                linLog: new BoolParam('Strong Separation (LinLog)', false)
            }
        }
        ,{
            algo: EdgeBundling,
            params: {
                edgeBundling: new BoolParam('Edge Bundling', false),
                midpoints: new DiscreteParam('Splits', defaultNumSplits , 0, 32),
                tau: new ContinuousParam('Speed', 1, 0.01, 10),
                charge: new ContinuousParam('Charge', -0.05, -1, -0.0000000001),
                springStrength: new ContinuousParam('Spring Strength', 400, 0, 800),
                springDistance: new ContinuousParam('Spring Distance', 0.5, 0.0000001, 1),
                // TODO : Remove these
                gravity: new ContinuousParam('Center Magnet', 1.0, 0.01, 100),
                scalingRatio: new ContinuousParam('Expansion Ratio', 1.0, 0.01, 100),
                edgeInfluence: new DiscreteParam('Edge Influence', 0, 0, 5, 1),
                preventOverlap: new BoolParam('Prevent Overlap', false),
                strongGravity: new BoolParam('Compact Layout', false),
                dissuadeHubs: new BoolParam('Dissuade Hubs', false),
                linLog: new BoolParam('Strong Separation (LinLog)', false)
            }
        }
    ],
    locks: {
        lockPoints: true,
        lockEdges: false,
        lockMidpoints: false,
        lockMidedges: false,
        interpolateMidPoints: false,
        interpolateMidPointsOnce: true
    },
    global: {
        simulationTime: 1, //SIMULATION_TIME, //milliseconds
        dimensions: [1, 1],
        numSplits: defaultNumSplits,
        numRenderedSplits: numRenderedSplits
    },
    devices: ['CPU', 'GPU']
}

var gsControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: GaussSeidel,
            params: {
                charge: new ContinuousParam('Charge', -0.000029360001841802474, -0.0001, 0),
                gravity: new ContinuousParam('Gravity', 0.020083175556898723, 0, 0.1),
                edgeStrength0: new ContinuousParam('Edge Strength A', 5, 0, 10),
                edgeDistance0: new ContinuousParam('Edge Distance A', 0.0001, 0, 0.1),
                edgeStrength1: new ContinuousParam('Edge Strength B', 1, 0, 10),
                edgeDistance1: new ContinuousParam('Edge Distance B', 0.01, 0, 0.1),
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
        numSplits: 0
    },
    devices: ['CPU', 'GPU']
}

function atlasControls(algo) {

    var devices;
    if (algo == forceAtlasBarnes) {
        devices = ['GPU'];
    } else {
        devices = ['CPU', 'GPU'];
    }

    var params = {
        tau: new ContinuousParam('Precision vs. Speed', 10.0, 1.0, 25.0),
        gravity: new ContinuousParam('Center Magnet', 1.0, 0.01, 100),
        scalingRatio: new ContinuousParam('Expansion Ratio', 1.0, 0.01, 100),
        edgeInfluence: new DiscreteParam('Edge Influence', 0, 0, 5, 1),
        preventOverlap: new BoolParam('Prevent Overlap', false),
        strongGravity: new BoolParam('Compact Layout', false),
        dissuadeHubs: new BoolParam('Dissuade Hubs', false),
        linLog: new BoolParam('Strong Separation (LinLog)', false)
    };

    return {
        simulator: SimCL,
        layoutAlgorithms: [
            {
                algo: algo,
                params: params
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
            numSplits: 0
        },
        devices: devices
    };
}


var controls = {
    'default':      [atlasControls(forceAtlasBarnes), atlasControls(ForceAtlas2Fast)],
    'uber':         [uberControls],
    'gauss':        [gsControls],
    'atlas':        [atlasControls(forceAtlasBarnes), atlasControls(ForceAtlas2Fast)],
    'atlas2':       [atlasControls(ForceAtlas2)],
    'atlas2fast':   [atlasControls(ForceAtlas2Fast)],
    'atlasbarnes':  [atlasControls(forceAtlasBarnes)]
}

function saneControl(control, name) {
    _.each(control, function(control) {
        _.each(['simulator', 'layoutAlgorithms', 'locks', 'global'], function (field) {
            if (!(field in control))
                log.die('In control %s, block %s missing', name, field);
        });

        _.each(['lockPoints', 'lockEdges', 'lockMidpoints', 'lockMidedges'], function (field) {
            if (!(field in control.locks))
                log.die('In control %s, lock %s missing', name, field);
        });

        _.each(['simulationTime', 'dimensions'], function (field) {
            if (!(field in control.global))
                log.die('In control %s.global, lock %s missing', name, field);
        });
    });
}

function getControls(controls) {
    _.each(controls, saneControl);
    return controls;
}

function toClient(layoutAlgorithms) {
    return _.map(layoutAlgorithms, function (la) {
        return {
            name: la.algo.name,
            params: _.map(la.params, function (p, name) {
                return p.toClient(name, la.algo.name);
            })
        };
    });
}

function fromClient(controls, simControls) {
    var algoParams = _.object(_.map(controls.layoutAlgorithms, function (la) {
        return [la.algo.name, la.params];
    }));

    return _.object(_.map(simControls, function (update, algoName) {
        if (!(algoName in algoParams)) {
            log.error('Unknown algorithm, ignoring setting update', algoName);
            return [];
        }
        var params = algoParams[algoName];
        var cfg = _.object(_.map(update, function (val, paramName) {
            if (!(paramName in params)) {
                log.error('Unknown parameter, ignoring setting update', paramName);
                return [];
            }
            var param = params[paramName];
            param.set(val);
            return [paramName, param.value];
        }));
        return [algoName, cfg];
    }));
}

module.exports = {
    controls: getControls(controls),
    toClient: toClient,
    fromClient: fromClient
};



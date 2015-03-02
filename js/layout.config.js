'use strict';

var _ = require('underscore');
var SimCL = require('./SimCL.js');
var util = require('./util.js');
var ForceAtlas2         = require('./forceatlas2.js'),
    ForceAtlas2Fast     = require('./forceatlas2fast.js'),
    forceAtlasBarnes    = require('./forceatlasbarnes.js'),
    GaussSeidel         = require('./gaussseidel.js'),
    EdgeBundling        = require('./edgebundling.js');

var SIMULATION_TIME = 1;


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


var uberControls = {
    simulator: SimCL,
    layoutAlgorithms: [
        {
            algo: EdgeBundling,
            params: {
                charge: new ContinuousParam('Charge', -0.000029360001841802474, -0.0001, 0),
                gravity: new ContinuousParam('Gravity', 0.020083175556898723, 0, 0.1),
                springStrength: new ContinuousParam('Spring Strength', 4.2921, 0, 10),
                springDistance: new ContinuousParam('Spring Distance', 0.0001, 0, 0.001),
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
        numSplits: 1
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
        tau: new ContinuousParam('Speed', 1.0, 0.1, 10),
        gravity: new ContinuousParam('Gravity', 1.0, 0.01, 100),
        scalingRatio: new ContinuousParam('Scaling', 1.0, 0.01, 100),
        edgeInfluence: new DiscreteParam('Edge Influence', 1, 0, 5, 1),
        preventOverlap: new BoolParam('Prevent Overlap', false),
        strongGravity: new BoolParam('Strong Gravity', false),
        dissuadeHubs: new BoolParam('Dissuade Hubs', false),
        linLog: new BoolParam('LinLog', false)
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
            numSplits: 1
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
            console.warn('Unknown algorithm, ignoring setting update', algoName);
            return [];
        }
        var params = algoParams[algoName];
        var cfg = _.object(_.map(update, function (val, paramName) {
            if (!(paramName in params)) {
                console.warn('Unknown parameter, ignoring setting update', paramName);
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



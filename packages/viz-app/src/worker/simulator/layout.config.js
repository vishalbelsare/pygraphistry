'use strict';

var _ = require('underscore');
var log         = require('@graphistry/common').logger;
var logger      = log.createLogger('graph-viz:cl:layoutconfig');

import * as SimCL from './SimCL.js';
import ForceAtlas2 from './layouts/forceAtlas2.js';

var SIMULATION_TIME = 100;


function Param(type, displayName, defValue, toSlider, fromSlider) {
    this.type = type;
    this.displayName = displayName;
    this.fromSlider = fromSlider || _.identity;
    this.toSlider = toSlider || _.identity;
    this.value = defValue;
}
Param.prototype.toClient = function(name, algoName) {
    return {
        name: name, algoName: algoName,
        displayName: this.displayName, type: this.type, value: this.toSlider(this.value),
    };
};
Param.prototype.set = function(v) {
    this.value = this.fromSlider(v);
};

function ContinuousParam(displayName, value, min, max) {
    var sliderRange = 101; // From 0 to 100
    var range = Math.abs(max - min);
    function fromSlider(val) {
        return min + (val / sliderRange * range);
    }
    function toSlider(val) {
        return (val - min) / range * sliderRange;
    }

    this.scale = 'log';

    Param.call(this, 'continuous', displayName, value, toSlider, fromSlider);
}
ContinuousParam.prototype = Object.create(Param.prototype);
ContinuousParam.prototype.constructor = ContinuousParam;

function DiscreteParam(displayName, value, min, max, step) {
    Param.call(this, 'discrete', displayName, value);
    this.min = min;
    this.max = max;
    this.step = step;
}
DiscreteParam.prototype = Object.create(Param.prototype);
DiscreteParam.prototype.constructor = DiscreteParam;
DiscreteParam.prototype.toClient = function (name, algoName) {
    var base = Param.prototype.toClient.call(this, name, algoName);
    return _.extend(base, {min: this.min, max: this.max, step: this.step});
};

function BoolParam(name, value) {
    Param.call(this, 'bool', name, value);
}
BoolParam.prototype = Object.create(Param.prototype);
BoolParam.prototype.constructor = BoolParam;

// Old edge bundling controls
//var edgeBundlingSplits = 7;
//var uberControls = {
    //simulator: SimCL,
    //layoutAlgorithms: [
        //{
            //algo: EdgeBundling,
            //params: {
                //tau: new ContinuousParam('Speed', 1, 0.01, 10),
                //charge: new ContinuousParam('Charge', -0.05, -1, -0.0000000001),
                //springStrength: new ContinuousParam('Spring Strength', 400, 0, 800),
                //springDistance: new ContinuousParam('Spring Distance', 0.5, 0.0000001, 1),
            //}
        //}
    //],
    //locks: {
        //lockPoints: true,
        //lockEdges: false,
        //lockMidpoints: false,
        //lockMidedges: false,
        //interpolateMidPoints: false,
        //interpolateMidPointsOnce: true
    //},
    //global: {
        //simulationTime: 1, //SIMULATION_TIME, //milliseconds
        //dimensions: [1, 1],
        //numSplits: edgeBundlingSplits,
        //numRenderedSplits: edgeBundlingSplits
    //},
    //devices: ['CPU', 'GPU']
//};


function atlasControls(algo) {

    var devices;
    if (algo === ForceAtlas2) {
        devices = ['GPU', 'CPU'];
    } else {
        devices = ['CPU', 'GPU'];
    }

    var params = {
        tau: new DiscreteParam('Precision vs. Speed', 0, -5, 5),
        gravity: new ContinuousParam('Center Magnet', 1.0, 0.01, 100),
        scalingRatio: new ContinuousParam('Expansion Ratio', 1.0, 0.01, 100),
        edgeInfluence: new DiscreteParam('Edge Influence', 0, 0, 5, 1),
        strongGravity: new BoolParam('Compact Layout', false),
        dissuadeHubs: new BoolParam('Dissuade Hubs', false),
        linLog: new BoolParam('Strong Separation (LinLog)', false),
        lockedX: new BoolParam('Locked X coordinates', false),
        lockedY: new BoolParam('Locked Y coordinates', false),
        lockedR: new BoolParam('Locked radius', false)
    };

    return {
        controlsName: 'atlasbarnes',
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

function lockedAtlasControlsXY(aC) {
    return {
        ...lockedAtlasControlsX(lockedAtlasControlsY(aC)),
        controlsName: 'lockedAtlasBarnesXY'
    };
}

function lockedAtlasControlsX(aC) {
    aC.layoutAlgorithms[0].params.lockedX = new BoolParam('Locked X coordinates', true);
    return { ...aC, controlsName: 'lockedAtlasBarnesX' };
}

function lockedAtlasControlsY(aC) {
    aC.layoutAlgorithms[0].params.lockedY = new BoolParam('Locked Y coordinates', true);
    return { ...aC, controlsName: 'lockedAtlasBarnesY' };
}

function lockedAtlasControlsR(aC) {
    aC.layoutAlgorithms[0].params.lockedR = new BoolParam('Locked radius', true);
    return { ...aC, controlsName: 'lockedAtlasBarnesR' };
}

export var controls = {
    'default':      [atlasControls(ForceAtlas2)],
    //'gis':         [uberControls],
    'lockedAtlasBarnesXY': [lockedAtlasControlsXY(atlasControls(ForceAtlas2))],
    'lockedAtlasBarnesX': [lockedAtlasControlsX(atlasControls(ForceAtlas2))],
    'lockedAtlasBarnesY': [lockedAtlasControlsY(atlasControls(ForceAtlas2))],
    'lockedAtlasBarnesR': [lockedAtlasControlsR(atlasControls(ForceAtlas2))],
    'atlasbarnes':  [atlasControls(ForceAtlas2)]
};

function saneControl(control, name) {
    _.each(control, function(control) {
        _.each(['simulator', 'layoutAlgorithms', 'locks', 'global'], function (field) {
            if (!(field in control)) {
                logger.die('In control %s, block %s missing', name, field);
            }
        });

        _.each(['lockPoints', 'lockEdges', 'lockMidpoints', 'lockMidedges'], function (field) {
            if (!(field in control.locks)) {
                logger.die('In control %s, lock %s missing', name, field);
            }
        });

        _.each(['simulationTime', 'dimensions'], function (field) {
            if (!(field in control.global)) {
                logger.die('In control %s.global, lock %s missing', name, field);
            }
        });
    });
}

function getControls(controls) {
    _.each(controls, saneControl);
    return controls;
}

export function toClient(layoutAlgorithms) {
    return _.map(layoutAlgorithms, function (la) {
        return {
            name: la.algo.algoName,
            params: _.map(la.params, function (p, name) {
                return p.toClient(name, la.algo.algoName);
            })
        };
    });
}

export function fromClient(controls, simControls) {
    var algoParams = _.object(_.map(controls.layoutAlgorithms, function (la) {
        return [la.algo.algoName, la.params];
    }));

    return _.object(_.map(simControls, function (update, algoName) {
        if (!(algoName in algoParams)) {
            logger.warn('Unknown algorithm, ignoring setting update', algoName);
            return [];
        }
        var params = algoParams[algoName];
        var cfg = _.object(_.map(update, function (val, paramName) {
            if (!(paramName in params)) {
                logger.warn('Unknown parameter, ignoring setting update', paramName);
                return [];
            }
            var param = params[paramName];
            param.set(val);
            return [paramName, param.value];
        }));
        return [algoName, cfg];
    }));
}

export function overrideLayoutOptionParams(controls, viewLayoutOptions) {
    let layoutOptions = null;
    switch (controls.controlsName) {
        case 'lockedAtlasBarnesX':
            layoutOptions = Array.from(viewLayoutOptions).filter((option) => option.id === 'lockedX');
            break;
        case 'lockedAtlasBarnesY':
            layoutOptions = Array.from(viewLayoutOptions).filter((option) => option.id === 'lockedY');
            break;
        case 'atlasbarnes':
        case 'lockedAtlasBarnesXY':
            layoutOptions = Array.from(viewLayoutOptions).filter((option) => option.id === 'lockedX' || option.id === 'lockedY');
            break;
    }
    if (layoutOptions) {
        layoutOptions.forEach((option) =>
            option.value = controls.controlsName !== 'atlasbarnes');
    }
    return viewLayoutOptions;
}

// export {
//     controls: getControls(controls),
//     toClient: toClient,
//     fromClient: fromClient
// };



'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:barneshut"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    Q = require('q'),
    gs    = require('./gaussseidel.js');



if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

var graphParams = {
    scalingRatio: null,
    gravity: null,
    edgeInfluence: null,
    flags: null
};

var toBarnesLayout = {};
_.extend(toBarnesLayout, graphParams, {
    numPoints: null,
    inputPositions: null,
    xCoords: null,
    yCoords: null,
    mass: null,
    blocked: null,
    maxDepth: null,
    stepNumber: null
});
var toBarnesLayoutOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
                          'inputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
                           'stepNumber'];
Object.seal(toBarnesLayout);

var barnesKernels = {};
_.extend(barnesKernels, graphParams, {
    xCoords: null,
    yCoords: null,
    accX: null,
    accY: null,
    children: null,
    mass: null,
    start: null,
    sort: null,
    globalXMin: null,
    globalXMax: null,
    globalYMin: null,
    globalYMax: null,
    count: null,
    blocked: null,
    step: null,
    bottom: null,
    maxDepth: null,
    radius: null,
    stepNumber: null,
    width: null,
    height: null,
    numBodies: null,
    numNodes: null
});
var barnesKernelsOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
                          'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
                          'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax',
                          'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'stepNumber',
                          'width', 'height', 'numBodies', 'numNodes'];
Object.seal(barnesKernels);

var fromBarnesLayout = {};
_.extend(fromBarnesLayout, graphParams, {
    numPoints: null,
    outputPositions: null,
    xCoords: null,
    yCoords: null,
    mass: null,
    blocked: null,
    maxDepth: null,
    stepNumber: null
});
var fromBarnesLayoutOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
                          'outputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
                           'stepNumber'];
Object.seal(fromBarnesLayout);


var faEdges = {};
_.extend(faEdges, graphParams, {
    springs: null,
    workList: null,
    inputPoints: null,
    stepNumber: null,
    outputPoints: null
});
var faEdgesOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'springs',
                    'workList', 'inputPoints', 'stepNumber', 'outputPoints'];
Object.seal(faEdges);

var gsSpringsGather = {}
_.extend(gsSpringsGather, gs.gsSpringsGather);

var argsType = {
    scalingRatio: cljs.types.float_t,
    gravity: cljs.types.float_t,
    edgeInfluence: cljs.types.uint_t,
    flags: cljs.types.uint_t,
    numPoints: cljs.types.uint_t,
    tilePointsParam: cljs.types.local_t,
    tilePointsParam2: cljs.types.local_t,
    tilePointsParam3: cljs.types.local_t,
    inputPositions: null,
    outputPositions: null,
    stepNumber: cljs.types.uint_t,
    inDegrees: null,
    outDegrees: null,
    springs: null,
    workList: null,
    inputPoints: null,
    outputPoints: null,
    xCoords: null,
    yCoords: null,
    accX: null,
    accY: null,
    children: null,
    mass: null,
    start: null,
    sort: null,
    globalXMin: null,
    globalXMax: null,
    globalYMin: null,
    globalYMax: null,
    count: null,
    blocked: null,
    step: null,
    bottom: null,
    maxDepth: null,
    radius: null,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    numBodies: cljs.types.uint_t,
    numNodes: cljs.types.uint_t
}


function printBuffer(buffer) {
  for( var i = 0; i < buffer.length; i++) {
    console.log(buffer[i]);
  }
};

var numNodes = 0;
var numBodies = 0;

var setupTempBuffers = function(simulator, tempBuffers) {
    simulator.resetBuffers(tempBuffers);
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count

    var num_nodes = simulator.numPoints * 2;
    // TODO (paden) make this into a definition
    var WARPSIZE = 16;
    if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
    while ((num_nodes & (WARPSIZE - 1)) != 0) num_nodes++;
    num_nodes--;
    var num_bodies = simulator.numPoints;
    numNodes = num_nodes;
    numBodies = num_bodies;
    // TODO (paden) Use actual number of workgroups. Don't hardcode
    var num_work_groups = 128;


    return Q.all(
        [
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT,  'x_cords'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'y_cords'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'accx'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'accy'),
        simulator.cl.createBuffer(4*(num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'children'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'mass'),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'start'),
         //TODO (paden) Create subBuffers
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'sort'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_x_mins'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_x_maxs'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_y_mins'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_y_maxs'),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'count'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'blocked'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'step'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'bottom'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'maxdepth'),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'radius')
        ])
    .spread(function (x_cords, y_cords, accx, accy, children, mass, start, sort, xmin, xmax, ymin, ymax, count,
          blocked, step, bottom, maxdepth, radius) {
      tempBuffers.x_cords = x_cords;
      tempBuffers.y_cords = y_cords;
      tempBuffers.accx = accx;
      tempBuffers.accy = accy;
      tempBuffers.children = children;
      tempBuffers.mass = mass;
      tempBuffers.start = start;
      tempBuffers.sort = sort;
      tempBuffers.xmin = xmin;
      tempBuffers.xmax = xmax;
      tempBuffers.ymin = ymin;
      tempBuffers.ymax = ymax;
      tempBuffers.count = count;
      tempBuffers.blocked = blocked;
      tempBuffers.step = step;
      tempBuffers.bottom = bottom;
      tempBuffers.maxdepth = maxdepth;
      tempBuffers.radius = radius;
      return;
    })
    .catch(function(error) {
      console.log(error);
    });
};

var tempBuffers  = {
    x_cords: null, //cl.createBuffer(cl, 0, "x_cords"),
    y_cords: null,
    velx: null,
    vely: null,
    accx: null,
    accy: null,
    children: null,
    global_x_mins: null,
    global_y_mins: null,
    global_x_maxs: null,
    global_y_maxs: null,
    count: null,
    blocked: null,
    step: null,
    bottom: null,
    maxdepth: null,
};

module.exports = {

    kernels: [
        {
            name: "to_barnes_layout",
            args: toBarnesLayout,
            order: toBarnesLayoutOrder,
            types: argsType,
            file: 'apply-forces.cl'
        }, {
            name: "from_barnes_layout",
            args: fromBarnesLayout,
            order: fromBarnesLayoutOrder,
            types: argsType,
            file: 'apply-forces.cl'
        }, {
            name: "bound_box",
            args: barnesKernels,
            order: barnesKernelsOrder,
            types: argsType,
            file: 'apply-forces.cl'
        }, {
            name: "build_tree",
            args: barnesKernels,
            order: barnesKernelsOrder,
            types: argsType,
            file: 'apply-forces.cl'
        }, {
            name: "compute_sums",
            args: barnesKernels,
            order: barnesKernelsOrder,
            types: argsType,
            file: 'apply-forces.cl'
        }, {
            name: "sort",
            args: barnesKernels,
            order: barnesKernelsOrder,
            types: argsType,
            file: 'apply-forces.cl'
        }, {
            name: "calculate_forces",
            args: barnesKernels,
            order: barnesKernelsOrder,
            types: argsType,
            file: 'apply-forces.cl'
        }, {
            name: "move_bodies",
            args: barnesKernels,
            order: barnesKernelsOrder,
            types: argsType,
            file: 'apply-forces.cl'
        },{
            name: "forceAtlasEdges",
            args: faEdges,
            order: faEdgesOrder,
            types: argsType,
            file: 'apply-forces.cl'
        },{
            name: "gaussSeidelSpringsGather",
            args: gsSpringsGather,
            order: gs.gsSpringsGatherOrder,
            types: gs.argsType,
            file: 'apply-forces.cl'
        }
    ],

  //kernelNames: ["to_barnes_layout", "bound_box", "build_tree", "compute_sums", "sort", "calculate_forces", "move_bodies", "from_barnes_layout", "forceAtlasEdges", "gaussSeidelSpringsGather" [> reuse <]],

  // Temporary buffers. These will only be used in barnes hut algorithm.
  tempBuffers: tempBuffers,

  numNodes: numNodes,

  numBodies: numBodies,

    setPhysics: function (cfg) {
        if ('scalingRatio' in cfg) {
            var val = webcl.type ? [cfg.scalingRatio] : new Float32Array([cfg.scalingRatio]);
            toBarnesLayout.scalingRatio = val;
            fromBarnesLayout.scalingRatio = val;
            barnesKernels.scalingRatio = val;
            faEdges.scalingRatio = val;
        }
        if ('gravity' in cfg) {
            var val = webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity]);
            toBarnesLayout.gravity = val;
            fromBarnesLayout.gravity = val;
            barnesKernels.gravity = val;
            faEdges.gravity = val;
        }
        if ('edgeInfluence' in cfg) {
            var val = webcl.type ? [cfg.edgeInfluence] : new Uint32Array([cfg.edgeInfluence]);
            toBarnesLayout.edgeInfluence = val;
            fromBarnesLayout.edgeInfluence = val;
            barnesKernels.edgeInfluence = val;
            faEdges.edgeInfluence = val;
        }

        var mask = 0;
        var flags = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];
        flags.forEach(function (flag, i) {
            var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : false;
            if (isOn) {
                mask = mask | (1 << i);
            }
        });
        var val = webcl.type ? [mask] : new Uint32Array([mask]);
        toBarnesLayout.flags = val;
        fromBarnesLayout.flags = val;
        barnesKernels.flags = val;
        faEdges.flags = val;
    },

  setPoints:_.identity,

  setEdges: function (simulator) {


      gsSpringsGather.springs = simulator.buffers.forwardsEdges.buffer;
      gsSpringsGather.workList = simulator.buffers.forwardsWorkItems.buffer;
      gsSpringsGather.inputPoints = simulator.buffers.curPoints.buffer;
      gsSpringsGather.springPositions = simulator.buffers.springsPos.buffer;

    return setupTempBuffers(simulator, tempBuffers).then(function () {
        barnesKernels.xCoords = tempBuffers.x_cords.buffer;
        barnesKernels.yCoords = tempBuffers.y_cords.buffer;
        barnesKernels.accX = tempBuffers.accx.buffer;
        barnesKernels.accY = tempBuffers.accy.buffer;
        barnesKernels.children = tempBuffers.children.buffer;
        barnesKernels.mass = tempBuffers.mass.buffer;
        barnesKernels.start = tempBuffers.start.buffer;
        barnesKernels.sort = tempBuffers.sort.buffer;
        barnesKernels.globalXMin = tempBuffers.xmin.buffer;
        barnesKernels.globalXMax = tempBuffers.xmax.buffer;
        barnesKernels.globalYMin = tempBuffers.ymin.buffer;
        barnesKernels.globalYMax = tempBuffers.ymax.buffer;
        barnesKernels.count = tempBuffers.count.buffer;
        barnesKernels.blocked = tempBuffers.blocked.buffer;
        barnesKernels.bottom = tempBuffers.bottom.buffer;
        barnesKernels.step = tempBuffers.step.buffer;
        barnesKernels.maxDepth = tempBuffers.maxdepth.buffer;
        barnesKernels.radius = tempBuffers.radius.buffer;
        barnesKernels.width = webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]);
        barnesKernels.height = webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]);
        barnesKernels.numBodies = webcl.type ? [numBodies] : new Uint32Array([numBodies]);
        barnesKernels.numNodes = webcl.type ? [numNodes] : new Uint32Array([numNodes]);

        toBarnesLayout.xCoords = tempBuffers.x_cords.buffer;
        toBarnesLayout.yCoords = tempBuffers.y_cords.buffer;
        toBarnesLayout.mass = tempBuffers.mass.buffer;
        toBarnesLayout.blocked = tempBuffers.blocked.buffer;
        toBarnesLayout.maxDepth = tempBuffers.maxdepth.buffer;
        toBarnesLayout.numPoints = webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]);
        toBarnesLayout.inputPositions = simulator.buffers.curPoints.buffer;

        fromBarnesLayout.xCoords = tempBuffers.x_cords.buffer;
        fromBarnesLayout.yCoords = tempBuffers.y_cords.buffer;
        fromBarnesLayout.mass = tempBuffers.mass.buffer;
        fromBarnesLayout.blocked = tempBuffers.blocked.buffer;
        fromBarnesLayout.maxDepth = tempBuffers.maxdepth.buffer;
        fromBarnesLayout.numPoints = webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]);
        fromBarnesLayout.outputPositions = simulator.buffers.nextPoints.buffer;

    })

    // Set here rather than in set points because we need edges for degrees. TODO use degrees
  },


  tick: function (simulator, stepNumber) {
    //
    // TODO (paden) Can set arguements outside of tick
    console.log("tick");
    simulator.tickBuffers(['nextPoints', 'curPoints', 'springsPos'])
    var totalTime = Date.now()
    var resources = [simulator.buffers.curPoints];

    toBarnesLayout.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
    fromBarnesLayout.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
    barnesKernels.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);

    setKernelArgs(simulator, "to_barnes_layout");
    setKernelArgs(simulator, "bound_box");
    setKernelArgs(simulator, "from_barnes_layout");
    setKernelArgs(simulator, "build_tree");
    setKernelArgs(simulator, "compute_sums");
    setKernelArgs(simulator, "sort");
    setKernelArgs(simulator, "calculate_forces");
    setKernelArgs(simulator, "move_bodies");

    var layoutKernelSeq = simulator.kernels.to_barnes_layout.call(256, resources);

    var atlasEdgesKernelSeq = function (edges, workItems, numWorkItems, fromPoints, toPoints) {

        var resources = [edges, workItems, fromPoints, toPoints];

        faEdges.springs = edges.buffer; 
        faEdges.workList = workItems.buffer;
        faEdges.inputPoints = fromPoints.buffer; 
        faEdges.outputPoints = toPoints.buffer;
        faEdges.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
        setKernelArgs(simulator, 'forceAtlasEdges');

        simulator.tickBuffers(
            _.keys(simulator.buffers).filter(function (name) {
                return simulator.buffers[name] == toPoints;
            }));

        debug("Running kernel forceAtlasEdges");
        return simulator.kernels.forceAtlasEdges.call(numWorkItems, resources);
    };

    return layoutKernelSeq
    .then(function() {
        resources = [];
        return simulator.kernels.bound_box.call(256*10, resources, 256)
    })
    .then(function () {
      return simulator.kernels.build_tree.call(4*256, resources, 256);
    })
    .then( function () {
        return simulator.kernels.compute_sums.call(4*256, resources, 256);
    })
    .then(function () {
      return simulator.kernels.sort.call(4*256, resources, 256);
    })
    .then(function () {
      return simulator.kernels.calculate_forces.call(400*256, resources, 256);
    })
    .then( function() {
      return simulator.kernels.move_bodies.call(256, resources, 256);
    })
    .then(function () {
        resources = [simulator.buffers.nextPoints];
        return simulator.kernels.from_barnes_layout.call(256, resources);
    })
    .then (function () {
      return simulator.cl.queue.finish()
    })
    .then(function() {
      if(simulator.numEdges > 0) {
        return atlasEdgesKernelSeq(
            simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
            simulator.buffers.nextPoints, simulator.buffers.curPoints)
          .then(function () {
            return atlasEdgesKernelSeq(
                simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                simulator.buffers.curPoints, simulator.buffers.nextPoints);
          })
        .then(function () {
          return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
        }).fail(function (err) {
          console.error("ERROR: appliedForces failed ", (err|{}).stack);
        });
      }
    })
    .then(function () {
      if (simulator.numEdges > 0) {

        var resources = [simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems,
        simulator.buffers.curPoints, simulator.buffers.springsPos];

        setKernelArgs(simulator, 'gaussSeidelSpringsGather');

        debug("Running gaussSeidelSpringsGather (forceatlas) kernel");
        return simulator.kernels.gaussSeidelSpringsGather.call(simulator.numForwardsWorkItems, resources);
      }
    }).fail(function (err) {
      console.error("ERROR forcealtas tick failed: ", (err||{}).stack);
    });
    }
  };
var setKernelArgs = cljs.setKernelArgs.bind('', module.exports.kernels)

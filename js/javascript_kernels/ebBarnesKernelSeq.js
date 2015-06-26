var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js');

var Log         = require('common/logger.js');
var logger      = Log.createLogger('graph-viz:cl:ebBarnesKernelSequence');

var EbBarnesKernelSeq = function (clContext) {

  this.argsToBarnesLayout = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
    'inputMidPositions', 'inputPositions', 'xCoords', 'yCoords', 'springs', 'edgeDirectionX', 'edgeDirectionY', 'edgeLength', 'mass', 'blocked', 'maxDepth',
    'pointDegrees', 'stepNumber', 'midpoint_stride', 'midpoints_per_edge', 'WARPSIZE', 'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
  ];

  // All Barnes kernels have same arguements
  this.argsBarnes = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
  'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
  'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
  'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
    'width', 'height', 'numBodies', 'numNodes', 'nextMidPoints', 'tau', 'WARPSIZE',
    'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
  ];

  this.argsMidPoints = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
  'yCoords', 'edgeDirectionX', 'edgeDirectionY', 'edgeLength', 'accX', 'accY', 'children', 'mass', 'start',
  'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
  'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
    'width', 'height', 'numBodies', 'numNodes', 'nextMidPoints', 'tau', 'charge', 'midpoint_stride', 'midpoints_per_edge', 'WARPSIZE', 'THREADS_BOUND',
    'THREADS_FORCES', 'THREADS_SUMS'];

  this.argsType = {
    scalingRatio: cljs.types.float_t,
    gravity: cljs.types.float_t,
    edgeInfluence: cljs.types.uint_t,
    flags: cljs.types.uint_t,
    numPoints: cljs.types.uint_t,
    tilesPerIteration: cljs.types.uint_t,
    tilePointsParam: cljs.types.local_t,
    tilePointsParam2: cljs.types.local_t,
    inputPositions: null,
    inputMidPositions: null,
    pointForces: null,
    partialForces: null,
    outputForces: null,
    outputPositions: null,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    stepNumber: cljs.types.uint_t,
    pointDegrees: null,
    edges: null,
    workList: null,
    inputPoints: null,
    outputPoints: null,
    curForces: null,
    prevForces: null,
    swings: null,
    tractions: null,
    gSpeeds: null,
    tau: cljs.types.float_t,
    charge: cljs.types.float_t,
    gSpeed: cljs.types.float_t,
    springs: null,
    xCoords: null,
    yCoords: null,
    edgeDirectionX: null,
    edgeDirectionY: null,
    edgeLength: null,
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
    numBodies: cljs.types.uint_t,
    numNodes: cljs.types.uint_t,
    numWorkItems: cljs.types.uint_t,
    globalSpeed: null,
    nextMidPoints: null,
    midpoint_stride: cljs.types.uint_t,
    midpoints_per_edge: cljs.types.uint_t,
    WARPSIZE: cljs.types.define,
    THREADS_BOUND: cljs.types.define,
    THREADS_FORCES: cljs.types.define,
    THREADS_SUMS: cljs.types.define
  }

  this.toBarnesLayout = new Kernel('to_barnes_layout', this.argsToBarnesLayout,
      this.argsType, 'barnesHut/toBarnesLayoutMidPoints.cl', clContext);

  this.boundBox = new Kernel('bound_box', this.argsBarnes,
      this.argsType, 'barnesHut/boundBox.cl', clContext);

  this.buildTree = new Kernel('build_tree', this.argsBarnes,
      this.argsType, 'barnesHut/buildTree.cl', clContext);

  this.computeSums = new Kernel('compute_sums', this.argsBarnes,
      this.argsType, 'barnesHut/computeSums.cl', clContext);

  this.sort = new Kernel('sort', this.argsBarnes,
      this.argsType, 'barnesHut/sort.cl', clContext);

  this.calculateMidPoints = new Kernel('calculate_forces', this.argsMidPoints,
      this.argsType, 'barnesHut/calculateMidPoints.cl', clContext);


  this.kernels = [this.toBarnesLayout, this.boundBox, this.buildTree, this.computeSums,
  this.sort, this.calculateMidPoints];

  this.setPhysics = function(flag) {

    this.toBarnesLayout.set({flags: flag});
    this.boundBox.set({flags: flag});
    this.buildTree.set({flags: flag});
    this.computeSums.set({flags: flag});
    this.sort.set({flags: flag});
    this.calculateMidPoints.set({flags: flag});

  };


  var tempBuffers  = {
    partialForces: null,
    x_cords: null, //cl.createBuffer(cl, 0, "x_cords"),
    y_cords: null,
    edgeDirectionX: null,
    edgeDirectionY: null,
    edgeLegnth: null,
    edgeLength: null,
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
  var setupTempBuffers = function(simulator, warpsize, numPoints) {
    simulator.resetBuffers(tempBuffers);
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count

    var num_nodes = numPoints * 5;
    if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
    while ((num_nodes & (warpsize - 1)) != 0) num_nodes++;
    num_nodes--;
    var num_bodies = numPoints;
    var numNodes = num_nodes;
    var numBodies = num_bodies;
    // Set this to the number of workgroups in boundBox kernel
    var num_work_groups = 30;


    return Q.all(
        [
        simulator.cl.createBuffer(2*num_bodies*Float32Array.BYTES_PER_ELEMENT,  'partialForces'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT,  'x_cords'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'y_cords'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT,  'edgeDirectionX'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'edgeDirectionY'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'edgeLegnth'),
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
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'radius'),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed')
        ])
    .spread(function (partialForces, x_cords, y_cords, edgeDirectionX, edgeDirectionY, edgeLength, accx, accy, children, mass, start, sort, xmin, xmax, ymin, ymax, count,
                      blocked, step, bottom, maxdepth, radius) {
          tempBuffers.partialForces = partialForces;
          tempBuffers.x_cords = x_cords;
          tempBuffers.y_cords = y_cords;
          tempBuffers.edgeDirectionX = edgeDirectionX;
          tempBuffers.edgeDirectionY = edgeDirectionY;
          tempBuffers.edgeLength = edgeLength;
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
          tempBuffers.numNodes = numNodes;
          tempBuffers.numBodies = numBodies;
          return tempBuffers;
    })
    .fail(Log.makeQErrorHandler("Setting temporary buffers for barnesHutKernelSequence failed"));
  };

  this.setMidPoints = function(simulator, layoutBuffers, warpsize, workItems) {
    var that = this;
    return setupTempBuffers(simulator, warpsize, simulator.numEdges).then(function (tempBuffers) {

      that.toBarnesLayout.set({
        xCoords: tempBuffers.x_cords.buffer,
        yCoords:tempBuffers.y_cords.buffer,
        edgeDirectionX: tempBuffers.edgeDirectionX.buffer,
        edgeDirectionY: tempBuffers.edgeDirectionY.buffer,
        edgeLength: tempBuffers.edgeLength.buffer,
        springs: simulator.buffers.forwardsEdges.buffer,
        mass:tempBuffers.mass.buffer,
        blocked:tempBuffers.blocked.buffer,
        maxDepth:tempBuffers.maxdepth.buffer,
        numPoints:simulator.numEdges,
        inputMidPositions: simulator.buffers.curMidPoints.buffer,
        inputPositions: simulator.buffers.curPoints.buffer,
        pointDegrees: simulator.buffers.degrees.buffer,
        WARPSIZE: warpsize,
        THREADS_SUMS: workItems.computeSums[1],
        THREADS_FORCES: workItems.calculateForces[1],
        THREADS_BOUND: workItems.boundBox[1]});

      var setBarnesKernelArgs = function(kernel, buffers) {
        var setArgs = {xCoords:buffers.x_cords.buffer,
          yCoords:buffers.y_cords.buffer,
          accX:buffers.accx.buffer,
          accY:buffers.accy.buffer,
          children:buffers.children.buffer,
          mass:buffers.mass.buffer,
          start:buffers.start.buffer,
          sort:buffers.sort.buffer,
          globalXMin:buffers.xmin.buffer,
          globalXMax:buffers.xmax.buffer,
          globalYMin:buffers.ymin.buffer,
          globalYMax:buffers.ymax.buffer,
          swings:layoutBuffers.swings.buffer,
          tractions:layoutBuffers.tractions.buffer,
          count:buffers.count.buffer,
          blocked:buffers.blocked.buffer,
          bottom:buffers.bottom.buffer,
          step:buffers.step.buffer,
          maxDepth:buffers.maxdepth.buffer,
          radius:buffers.radius.buffer,
          globalSpeed: layoutBuffers.globalSpeed.buffer,
          width:simulator.controls.global.dimensions[0],
          height:simulator.controls.global.dimensions[1],
          numBodies:buffers.numBodies,
          numNodes:buffers.numNodes,
          nextMidPoints:layoutBuffers.tempMidPoints.buffer,
          WARPSIZE:warpsize,
          THREADS_SUMS: workItems.computeSums[1],
          THREADS_FORCES: workItems.calculateForces[1],
          THREADS_BOUND: workItems.boundBox[1]
        };

        kernel.set(setArgs);
      };

      setBarnesKernelArgs(that.boundBox, tempBuffers);
      setBarnesKernelArgs(that.buildTree, tempBuffers);
      setBarnesKernelArgs(that.computeSums, tempBuffers);
      setBarnesKernelArgs(that.sort, tempBuffers);
      var buffers = tempBuffers;

      that.calculateMidPoints.set({
        xCoords:buffers.x_cords.buffer,
        yCoords:buffers.y_cords.buffer,
        edgeDirectionX: tempBuffers.edgeDirectionX.buffer,
        edgeDirectionY: tempBuffers.edgeDirectionY.buffer,
        edgeLength: tempBuffers.edgeLength.buffer,
        accX:buffers.accx.buffer,
        accY:buffers.accy.buffer,
        children:buffers.children.buffer,
        mass:buffers.mass.buffer,
        start:buffers.start.buffer,
        sort:buffers.sort.buffer,
        globalXMin:buffers.xmin.buffer,
        globalXMax:buffers.xmax.buffer,
        globalYMin:buffers.ymin.buffer,
        globalYMax:buffers.ymax.buffer,
        swings:layoutBuffers.swings.buffer,
        tractions:layoutBuffers.tractions.buffer,
        count:buffers.count.buffer,
        blocked:buffers.blocked.buffer,
        bottom:buffers.bottom.buffer,
        step:buffers.step.buffer,
        maxDepth:buffers.maxdepth.buffer,
        radius:buffers.radius.buffer,
        globalSpeed: layoutBuffers.globalSpeed.buffer,
        width:simulator.controls.global.dimensions[0],
        height:simulator.controls.global.dimensions[1],
        numBodies:buffers.numBodies,
        numNodes:buffers.numNodes,
        nextMidPoints:layoutBuffers.tempMidPoints.buffer,
        WARPSIZE:warpsize,
        THREADS_SUMS: workItems.computeSums[1],
        THREADS_FORCES: workItems.calculateForces[1],
        THREADS_BOUND: workItems.boundBox[1]
      });
    }).fail(Log.makeQErrorHandler('setupTempBuffers'));
  };

  // TODO (paden) Can probably combine ExecKernel functions
  this.execKernels = function(simulator, stepNumber, workItems, midpoint_index) {

    var resources = [
      simulator.buffers.curMidPoints,
      simulator.buffers.forwardsDegrees,
      simulator.buffers.backwardsDegrees,
        simulator.buffers.nextMidPoints
    ];

    this.toBarnesLayout.set({stepNumber: stepNumber, midpoint_stride: midpoint_index, midpoints_per_edge: simulator.numSplits});
    this.boundBox.set({stepNumber: stepNumber});
    this.buildTree.set({stepNumber: stepNumber});
    this.computeSums.set({stepNumber: stepNumber});
    this.sort.set({stepNumber: stepNumber});
    this.calculateMidPoints.set({stepNumber: stepNumber, midpoint_stride: midpoint_index, midpoints_per_edge:simulator.numSplits});

    simulator.tickBuffers(['nextMidPoints']);

    logger.debug("Running Edge Bundling Barnes Hut Kernel Sequence");

    // For all calls, we must have the # work items be a multiple of the workgroup size.
    var that = this;
    return this.toBarnesLayout.exec([workItems.toBarnesLayout[0]], resources, [workItems.toBarnesLayout[1]])
      .then(function () {
        return that.boundBox.exec([workItems.boundBox[0]], resources, [workItems.boundBox[1]]);
      })

    .then(function () {
      return that.buildTree.exec([workItems.buildTree[0]], resources, [workItems.buildTree[1]]);
    })

    .then(function () {
      return that.computeSums.exec([workItems.computeSums[0]], resources, [workItems.computeSums[1]]);
    })

    .then(function () {
      return that.sort.exec([workItems.sort[0]], resources, [workItems.sort[1]]);
    })

    .then(function () {
      return that.calculateMidPoints.exec([workItems.calculateForces[0]], resources, [workItems.calculateForces[1]]);
    })
    .fail(Log.makeQErrorHandler("Executing  EbBarnesKernelSeq failed"));
  };

};

module.exports = EbBarnesKernelSeq;


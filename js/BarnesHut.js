

var debug = require("debug")("N-body:SimCL:BarnesHut"),
    _ = require('underscore');
    Q = require('Q');


var cljs = require('./cl.js');


if (typeof(window) == 'undefined') {
  var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
  var webcl = window.webcl;
}
console.log(webcl.type);

//corresponds to apply-forces.cl
//webcl.type ? [1] : new Uint32Array([localPosSize]),
var graphArgs =
webcl.type ? [[1], [1], [0], [0]]
: [new Float32Array([1]), new Float32Array([1]), new Uint32Array([0]), new Uint32Array([0])];
var graphArgs_t = webcl.type ? [cljs.types.float_t, cljs.types.float_t, cljs.types.uint_t, cljs.types.uint_t] : null;


function printBuffer(buffer) {
  for( var i = 0; i < buffer.length; i++) {
    console.log(buffer[i]);
  }
};

var setupTempBuffers = function(simulator, tempBuffers) {
    simulator.resetBuffers(tempBuffers);
    simulator.renderer.numPoints = simulator.numPoints;
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count

    var num_nodes = simulator.numPoints * 2;
    // TODO (paden) make this into a definition
    var WARPSIZE = 16;
    if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
    while ((num_nodes & (WARPSIZE - 1)) != 0) num_nodes++;
    num_nodes--;
    var num_bodies = simulator.numPoints;
    simulator.barnes.num_nodes = num_nodes;
    simulator.barnes.num_bodies = num_bodies;
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
      console.log(tempBuffers);
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
      console.log("ERROR in setUP");
    });
};

tempBuffers  = {
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
  },


module.exports = {

  kernelNames: ["to_barnes_layout", "bound_box", "build_tree", "compute_sums", "sort", "calculate_forces", "move_bodies", "from_barnes_layout", "forceAtlasEdges", "gaussSeidelSpringsGather" /* reuse */],

  // Temporary buffers. These will only be used in barnes hut algorithm.
  tempBuffers: tempBuffers,



  setPhysics: function (simulator, cfg) {

    var vArr = [null, null, null, null];
    var tArr = [null, null, null, null];
    var anyBarnesArgsChanged = false;

    if (cfg.hasOwnProperty('scalingRatio')) {
      anyBarnesArgsChanged = true;
      var v = webcl.type ? [cfg.scalingRatio] : new Float32Array([cfg.scalingRatio]);
      var t = cljs.types.float_t;
      var idx = 0;
      vArr[idx] = v;
      tArr[idx] = t;
    }
    if (cfg.hasOwnProperty('gravity')) {
      anyBarnesArgsChanged = true;
      var v = webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity]);
      var t = cljs.types.float_t;
      var idx = 1;
      vArr[idx] = v;
      tArr[idx] = t;
    }
    if (cfg.hasOwnProperty('edgeInfluence')) {
      anyBarnesArgsChanged = true;
      var v = webcl.type ? [cfg.edgeInfluence] : new Uint32Array([cfg.edgeInfluence]);
      var t = cljs.types.uint_t;
      var idx = 2;
      vArr[idx] = v;
      tArr[idx] = t;
    }
    var flags = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];
    var isAnyFlagToggled = flags.filter(function (flag) { return cfg.hasOwnProperty(flag); }).length;
    if (isAnyFlagToggled) {
      anyBarnesArgsChanged = true;
      var mask = 0;
      flags.forEach(function (flag, i) {
        var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : simulator.physics[flag];;
        if (isOn) {
          mask = mask | (1 << i);
        }
      });

      var v = webcl.type ? [mask] : new Uint32Array([mask]);
      var t = cljs.types.uint_t;
      var idx = 3;
      vArr[idx] = v;
      tArr[idx] = t;
    }


    if (anyBarnesArgsChanged) {
      simulator.kernels.bound_box.setArgs(vArr, tArr);
      simulator.kernels.calculate_forces.setArgs(vArr, tArr);
      simulator.kernels.move_bodies.setArgs(vArr, tArr);
      simulator.kernels.forceAtlasEdges.setArgs(vArr, tArr);
    }

  },

  setPoints:_.identity,

  setEdges: function (simulator) {
    

    simulator.kernels.forceAtlasEdges.setArgs(
        graphArgs.concat([
          null, //forwards/backwards picked dynamically
          null, //forwards/backwards picked dynamically
          null, //simulator.buffers.curPoints.buffer then simulator.buffers.nextPoints.buffer
          null,
          null
        ]),
        webcl.type ? graphArgs_t.concat([
          null, null, null,
          null, null
        ]) : null);

    simulator.kernels.gaussSeidelSpringsGather.setArgs(
        [   simulator.buffers.forwardsEdges.buffer,
        simulator.buffers.forwardsWorkItems.buffer,
        simulator.buffers.curPoints.buffer,
        simulator.buffers.springsPos.buffer],
        webcl.type ? [null, null, null, null]
        : null);

    function setBarnesArgs(simulator, kernelName) {
      simulator.kernels[kernelName].setArgs(
          graphArgs.concat(
            tempBuffers.x_cords.buffer,
            tempBuffers.y_cords.buffer,
            tempBuffers.accx.buffer,
            tempBuffers.accy.buffer,
            tempBuffers.children.buffer,
            tempBuffers.mass.buffer,
            tempBuffers.start.buffer,
            tempBuffers.sort.buffer,
            tempBuffers.xmin.buffer,
            tempBuffers.xmax.buffer,
            tempBuffers.ymin.buffer,
            tempBuffers.ymax.buffer,
            tempBuffers.count.buffer,
            tempBuffers.blocked.buffer,
            tempBuffers.step.buffer,
            tempBuffers.bottom.buffer,
            tempBuffers.maxdepth.buffer,
            tempBuffers.radius.buffer,
            webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]),
            webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]),
            webcl.type ? [simulator.barnes.num_bodies] : new Uint32Array([simulator.barnes.num_bodies]),
            webcl.type ? [simulator.barnes.num_nodes] : new Uint32Array([simulator.barnes.num_nodes])
            ),
          webcl.type ? graphArgs_t.concat(
              [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
              null, null, null, webcl.type.FLOAT, webcl.type.FLOAT, webcl.type.INT, webcl.type.INT]) : undefined
      );
    }
    return setupTempBuffers(simulator, tempBuffers).then(function () {
    setBarnesArgs(simulator, "bound_box");
    setBarnesArgs(simulator, "build_tree");
    setBarnesArgs(simulator, "compute_sums");
    setBarnesArgs(simulator, "sort");
    setBarnesArgs(simulator, "calculate_forces");
    setBarnesArgs(simulator, "move_bodies");
    })


    // Set here rather than in set points because we need edges for degrees. TODO use degrees
  },

  tick: function (simulator, stepNumber) {
    //if (simulator.barnes.flag) return;
    simulator.barnes.flag = 1;
    //simulator.numPoints = 5002;
    //simulator.barnes.num_bodies = 5002;
    //simulator.barnes.num_nodes = 20008;
    // TODO (paden) Can set arguements outside of tick
    simulator.tickBuffers(['nextPoints', 'curPoints', 'springsPos'])
    var totalTime = Date.now()
    curPointsBuffer = simulator.buffers.curPoints.buffer;
    simulator.kernels.to_barnes_layout.setArgs(
        graphArgs.concat(
          webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]),
          curPointsBuffer,
          tempBuffers.x_cords.buffer,
          tempBuffers.y_cords.buffer,
          tempBuffers.mass.buffer,
          tempBuffers.blocked.buffer,
          tempBuffers.maxdepth.buffer
          ),
        webcl.type ? graphArgs_t.concat(webcl.type.UINT, null, null, null, null, null, null, null) : undefined

        );
    resources = [simulator.buffers.curPoints];
    var layoutKernelSeq = simulator.kernels.to_barnes_layout.call(256, resources);
    var now = Date.now()
    return layoutKernelSeq
    .then(function() {
        console.log("barnes layout completed in:", Date.now() - now);
        now = Date.now();
        resources = [];
        //return simulator.kernels.bound_box.call(256, resources)
        simulator.kernels.bound_box.call(256, resources)
        return simulator.cl.queue.finish()
    })
    .then(function () {
      console.log("bound_box completed in:", Date.now() - now);
      now = Date.now();
      //return simulator.kernels.build_tree.call(256, resources);
      simulator.kernels.build_tree.call(256, resources);
      return simulator.cl.queue.finish()
    })
    .then( function () {
      console.log("build_tree completed in:", Date.now() - now);
      now = Date.now();
        simulator.kernels.compute_sums.call(256, resources);
        return simulator.cl.queue.finish()
    })
    .then(function () {
      console.log("compute_sums completed in:", Date.now() - now);
      return simulator.kernels.sort.call(256, resources);
    })
    .then( function () {
     return simulator.cl.queue.finish()
    })
    .then(function () {
      console.log("sort completed in:", Date.now() - now);
      now = Date.now();
      return simulator.kernels.calculate_forces.call(256, resources);
    })
    .then( function() {
       return simulator.cl.queue.finish();
    })
    .then( function() {
      console.log("calculate forces completed in:", Date.now() - now);
      now = Date.now();
      return simulator.kernels.move_bodies.call(256, resources);
    })
    .then (function () {
      return simulator.cl.queue.finish();
    })
    .then(function () {
        console.log("move_bodies completed in:", Date.now() - now);
        nextPointsBuffer = simulator.buffers.nextPoints.buffer;
        simulator.kernels.from_barnes_layout.setArgs(
            graphArgs.concat(
              webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]),
              nextPointsBuffer,
              tempBuffers.x_cords.buffer,
              tempBuffers.y_cords.buffer,
              tempBuffers.mass.buffer,
              tempBuffers.blocked.buffer,
              tempBuffers.maxdepth.buffer
              ),
            webcl.type ? graphArgs_t.concat(webcl.type.UINT, null, null, null, null, null, null, null) : undefined

              );
        resources = [simulator.buffers.nextPoints];
        before_layout = Date.now();
        return simulator.kernels.from_barnes_layout.call(256, resources);
    })
    .then (function () {
      return simulator.cl.queue.finish()
    })
    .then(function () {
      console.log("from barnes layout", Date.now() - before_layout);
      console.log("Total time for points", Date.now() - totalTime);
      var atlasEdgesKernelSeq = function (edges, workItems, numWorkItems, fromPoints, toPoints) {

        var resources = [edges, workItems, fromPoints, toPoints];

        simulator.kernels.forceAtlasEdges.setArgs(
            graphArgs.map(function () { return null; })
            .concat(
              [edges.buffer, workItems.buffer, fromPoints.buffer, webcl.type ? [stepNumber] : new Uint32Array([stepNumber]),
              toPoints.buffer]),
            webcl.type ? graphArgs_t.map(function () { return null; })
            .concat([null, null, null, cljs.types.uint_t, null])
            : undefined);

        simulator.tickBuffers(
            _.keys(simulator.buffers).filter(function (name) {
              return simulator.buffers[name] == toPoints;
            }));

        return simulator.kernels.forceAtlasEdges.call(numWorkItems, resources);
      };

      if(simulator.numEdges > 0) {
        now = Date.now()
        return atlasEdgesKernelSeq(
            simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
            simulator.buffers.nextPoints, simulator.buffers.curPoints)
          .then(function () {
            return atlasEdgesKernelSeq(
                simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                simulator.buffers.curPoints, simulator.buffers.nextPoints);
          })
          .then( function () {
            return simulator.cl.queue.finish();
          })
        .then(function () {
        console.log("Atlas edges completed in:", Date.now() - now);
          beforeCopy = Date.now();
          return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
        })
        .then (function () {
          return simulator.cl.queue.finish();
        })
      }
    })
    .then(function () {
      console.log("Trasfer data complted in:", Date.now() - beforeCopy);
      if (simulator.numEdges > 0) {

        var resources = [simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems,
        simulator.buffers.curPoints, simulator.buffers.springsPos];
        now = Date.now();

        simulator.kernels.gaussSeidelSpringsGather.call(simulator.numForwardsWorkItems, resources);
        simulator.cl.queue.finish();
      }
    })
    .then(function () {
      console.log("time for gather", Date.now() - now);
    })
  }
  };

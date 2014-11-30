

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


function testLayout(simulator) {
  return readBuffers(simulator).then( function(hostMemory) {
    for (var i = 0; i < simulator.barnes.num_nodes; i++) {
      if (hostMemory.xCoords[i] != hostMemory.curPoints[2 * i]) {
        console.log("Error in layout with xcords");
        console.log(hostMemory.xCoords[i]);
        console.log(hostMemory.curPoints[2*i]);
      }
      if (hostMemory.yCoords[i] != hostMemory.curPoints[2 * i + 1]) {
        console.log("Error in layout with ycords");
        console.log(hostMemory.yCoords[i]);
        console.log(hostMemory.curPoints[2*i + 1]);
      }
    }
  })
};

function testBoundBox(simulator) {
  return readBuffers(simulator).then( function(hostMemory) {
    var maxX = hostMemory.xCoords[0];
    var minX = hostMemory.xCoords[0];
    var maxY = minY = hostMemory.yCoords[0];
    for (var i = 0; i < simulator.barnes.num_bodies; i = i + 1) {
      maxX = Math.max(maxX, hostMemory.xCoords[i]);
      minX = Math.min(minX, hostMemory.xCoords[i]);
      maxY = Math.max(maxY, hostMemory.yCoords[i]);
      minY = Math.min(minY, hostMemory.yCoords[i]);
    }

    if ( ((minX + maxX) * 0.5 - hostMemory.xCoords[simulator.barnes.num_nodes])/((minX + maxX) * 0.5) > 0.00001) {
      console.log("ERROR in bound box x");
    }
    if ( ((minY + maxY) * 0.5 - hostMemory.yCoords[simulator.barnes.num_nodes])/((minY + maxY) * 0.5) > 0.00001) {
      console.log("Error in bound box y");
    }
  })
};

function testBuildTree(simulator) {
  return readBuffers(simulator).then( function(hostMemory) {

    function CheckTreeHelper(index, hostMemory) {
      if (index >= simulator.barnes.num_bodies) {
        var parentXCoord = hostMemory.xCoords[index];
        var parentYCoord = hostMemory.yCoords[index];
        for (var i = 0; i < 4; i++) {
          var childIndex = hostMemory.children[4*index + i];
          if (childIndex >= 0) {
            var childXCoord = hostMemory.xCoords[childIndex];
            var childYCoord = hostMemory.yCoords[childIndex];
            var j = 0;
            if (childXCoord > parentXCoord) j += 1;
            if (childYCoord > parentYCoord) j += 2;
            if (j != i) {
              console.log("Error in build tree!");
            }
            return CheckTreeHelper(childIndex, hostMemory);
          }
        }
      }
    };

    return CheckTreeHelper(simulator.barnes.num_nodes, hostMemory);
  })
  .then( function () {
    return;
  })
}

var CheckSummation  = Q.promised(function (simulator, cpuMemory, gpuMemory) {
  var epsilon = 0.00001;
  for (var i = cpuMemory.bottom[0]; i < simulator.barnes.num_nodes; i++) {
    if (Math.abs((gpuMemory.xCoords[i] - cpuMemory.xCoords[i])/cpuMemory.xCoords[i]) > epsilon) {
      console.log(" \n\n\n Error in Summation! ");
      console.log("Gpu x: " + gpuMemory.xCoords[i]);
      console.log("Cpu x: " + cpuMemory.xCoords[i]);
      
    }
    if ((gpuMemory.count[i] - cpuMemory.count[i]) > 0) {
      console.log(" \n\n\n Error in Summation! \n\n");
    }
    if (Math.abs((gpuMemory.yCoords[i] - cpuMemory.yCoords[i])/cpuMemory.yCoords[i]) > epsilon) {
      console.log(" \n\n\n Error in Summation! \n\n");
    }
  }
  console.log("Summation is correct");
});


function CalculateSummation(simulator) {
  return readBuffers(simulator).then( function (hostMemory) {
    var bottom = hostMemory.bottom[0];
    for (var parent = bottom; parent <= simulator.barnes.num_nodes; parent++) {
      var px = 0.0;
      var py = 0.0;
      var cnt = 0;
      var m = 0.0;
      var j = 0;
      var cm = 0.0;
      for (var i = 0; i < 4; i++) {
        child = hostMemory.children[4 * parent + i];
        if (child >= 0) {
          if (i != j) {
            hostMemory.children[parent*4+i] = -1;
            hostMemory.children[parent*4+j] = child;
          }
          m = hostMemory.mass[child];
          if (child >= simulator.barnes.num_bodies) {
            cnt += hostMemory.count[child] - 1;
          }
          cm += m;
          px += hostMemory.xCoords[child] * m;
          py += hostMemory.yCoords[child] * m;
          j++;
        }
      }
      cnt += j;
      hostMemory.count[parent] = cnt;
      m = 1.0 / cm;
      hostMemory.xCoords[parent] = px * m;
      hostMemory.yCoords[parent] = py * m;
      hostMemory.mass[parent] = cm;
    }
    return hostMemory
  });
}

function CalculateSort(simulator) {
  var hostMemory;
  var CalculateSortHelper = function(index, start) {
    var bottomNode = hostMemory.bottom[0];
    var numBodies = simulator.barnes.num_bodies;
    var numNodes = simulator.barnes.num_nodes;
    for (var i = 0; i < 4; i++) {
    var childIndex = hostMemory.children[index*4+i];
      if (childIndex >= numBodies) {
        hostMemory.start[childIndex] = start;
        CalculateSortHelper(childIndex, start);
        start += hostMemory.count[childIndex];
      } else if (childIndex >= 0) {
        hostMemory.sort[start] = childIndex;
        start++;
      }
    }
    return hostMemory;
  };

  return readBuffers(simulator)
  .then( function (hostMemoryArg) {
    hostMemory = hostMemoryArg;
    return CalculateSortHelper(simulator.barnes.num_nodes, 0);
  })
};

var CheckSorted = Q.promised(function(simulator, cpuMemory, gpuMemory) {
  //printBuffer(cpuMemory.sort);
  console.log("gpu");
  //printBuffer(gpuMemory.sort);
  for (var i = 0; i < simulator.barnes.num_bodies; i++) {
    if (gpuMemory.sort[i] != cpuMemory.sort[i]) {
      console.log("ERROR In sort");
      console.log(gpuMemory.sort[i]);
      console.log(cpuMemory.sort[i]);
    }
    if (gpuMemory.start[i] != cpuMemory.start[i]) {
      console.log("Error in sort, start");
    }
  }
  console.log("sorted correctly");
});

var CheckForces = Q.promised(function(simulator, cpuMemory, gpuMemory) {
    epsilon = 0.01;
    for (var i = 0; i < simulator.barnes.num_bodies; i++) {
      if (Math.abs((gpuMemory.accx[i] - cpuMemory.accx[i])/cpuMemory.accx[i]) > epsilon) {
        console.log("Error in force calculation!");
      }
    }
    console.log("Checked forces");
});



function CalculateForce(simulator) {
  return readBuffers(simulator)
  .then( function (hostMemory) {
    var itolsqd = 1 / (0.5 * 0.5);
    var maxDepth = hostMemory.maxDepth[0];
    var radius = hostMemory.radius[0];
    var numBodies = simulator.barnes.num_bodies;
    var numNodes = simulator.barnes.num_nodes;
    var WARPSIZE = 16;
    var dq = [];
    var ax = [];
    var ay = [];
    var parentIndex = [];
    var childIndex = [];
    dq[0] = radius * radius * itolsqd;
    var px = [];
    var py = [];
    var dx = [];
    var dy = [];
    var temp = [];
    for (var i = 1; i < maxDepth; i++) {
      dq[i] = dq[i - 1] * 0.25;
    }
    //console.log(dq);
    // TODO This should be some sort of error
    //if (maxDepth >= MAXDEPTH)
    console.log("num bodies: " + numBodies);
    console.log("num nodes: " + numNodes);
    for (var k = 0; k + WARPSIZE  < numBodies; k+= WARPSIZE) {
      for (var i = 0; i < WARPSIZE; i++) {
        ax[i] = 0.0;
        ay[i] = 0.0;
      }
      parentIndex[0] = numNodes;
      childIndex[0] = 0;
      depth = 0;
      while (depth >= 0) {
        while (childIndex[depth] < 4) {
          child = hostMemory.children[parentIndex[depth]*4+childIndex[depth]];
          childIndex[depth]++;
          if(child >= 0) {
            var go_deeper = false;
            for (var j = 0; j < WARPSIZE; j++) {
              var index = hostMemory.sort[k+j];
              px[j] = hostMemory.xCoords[index];
              py[j] = hostMemory.yCoords[index];
              dx[j] = hostMemory.xCoords[child] - px[j];
              dy[j] = hostMemory.yCoords[child] - py[j];
              temp[j] = dx[j]*dx[j] + (dy[j] * dy[j] + 0.0001);
              if (! (child <= numBodies || temp[j] >= dq[depth])) {
                go_deeper = true;
              }
            }
            if (!go_deeper) {
              for (var j = 0; j < WARPSIZE; j++) {
                temp[j] = 1 / Math.sqrt(temp[j]);
                temp[j] = hostMemory.mass[child] * temp[j] * temp[j] * temp[j];
                ax[j] += dx[j] * temp[j];
                ay[j] += dy[j] * temp[j];
              }
            } else {
              depth++;
              parentIndex[depth] = child;
              childIndex[depth] = 0;
            }
          } else {
            depth = Math.max(0, depth - 1);
          }
        }
        depth--;
      }
      for (var j = 0; j < WARPSIZE; j++) {
        var index = hostMemory.sort[k+j];
        hostMemory.accx[index] = ax[j];
        hostMemory.accy[index] = ay[j];
      }
    }
    for (;k < numBodies; k++) {
      var index = hostMemory.sort[k];
      var px1 = hostMemory.xCoords[index];
      var py1 = hostMemory.yCoords[index];
      var ax = 0.0;
      var ay = 0.0;
      var depth = 0;
      parentIndex[depth] = numNodes;
      childIndex[depth] = 0;
      while (depth >= 0) {
        while (childIndex[depth] < 4) {
          child = hostMemory.children[parentIndex[depth]*4 + childIndex[depth]];
          childIndex[depth]++;
          if (child >= 0) {
            var dx = hostMemory.xCoords[child] - px1;
            var dy = hostMemory.yCoords[child] - py1;
            if (k == 0) {
              console.log("in CPU dx: " + dx);
              console.log("in CPU dy: " + dy);
            }

            var temp = dx*dx + (dy*dy + 0.0001);
            if (child < numBodies) {
              temp = 1 / Math.sqrt(temp);
              temp = hostMemory.mass[child] * temp * temp * temp;
              ax += dx * temp;
              ay += dy * temp;
            } else {
              depth++;
              parentIndex[depth] = child;
              childIndex[depth] = 0;
            }
          } else {
            depth = Math.max(0, depth - 1);
          }
        }
        depth--;
      }
      hostMemory.accx[index] = ax;
      hostMemory.accy[index] = ay;
    }
    return hostMemory;
  })
};

function printBuffer(buffer) {
  for( var i = 0; i < buffer.length; i++) {
    console.log(buffer[i]);
  }
};

function setBarnesArgs(simulator, kernelName) {
  simulator.kernels[kernelName].setArgs(
      graphArgs.concat(
        simulator.barnes.buffers.x_cords.buffer,
        simulator.barnes.buffers.y_cords.buffer,
        simulator.barnes.buffers.accx.buffer,
        simulator.barnes.buffers.accy.buffer,
        simulator.barnes.buffers.children.buffer,
        simulator.barnes.buffers.mass.buffer,
        simulator.barnes.buffers.start.buffer,
        simulator.barnes.buffers.sort.buffer,
        simulator.barnes.buffers.xmin.buffer,
        simulator.barnes.buffers.xmax.buffer,
        simulator.barnes.buffers.ymin.buffer,
        simulator.barnes.buffers.ymax.buffer,
        simulator.barnes.buffers.count.buffer,
        simulator.barnes.buffers.blocked.buffer,
        simulator.barnes.buffers.step.buffer,
        simulator.barnes.buffers.bottom.buffer,
        simulator.barnes.buffers.maxdepth.buffer,
        simulator.barnes.buffers.radius.buffer,
        webcl.type ? [simulator.barnes.num_bodies] : new Uint32Array([simulator.barnes.num_bodies]),
        webcl.type ? [simulator.barnes.num_nodes] : new Uint32Array([simulator.barnes.num_nodes])
          ), webcl.type ? graphArgs_t.concat(
            [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, webcl.type.INT, webcl.type.INT]) : undefined
          );
}



function readBuffers(simulator) {
  var numNodes = simulator.barnes.num_nodes;
  var numBodies = simulator.barnes.num_bodies;

  var xCoordsHost = new Float32Array(simulator.barnes.num_nodes + 1);
  var yCoordsHost = new Float32Array(simulator.barnes.num_nodes + 1);
  var curPointsHost = new Float32Array(2*(simulator.barnes.num_nodes + 1));
  var childrenHost = new Int32Array(4*(simulator.barnes.num_nodes + 1));
  var bottomHost = new Int32Array(1);
  var countHost = new Int32Array((simulator.barnes.num_nodes + 1));
  var massHost = new Float32Array((simulator.barnes.num_nodes + 1));
  var maxDepthHost = new Int32Array(1);
  var radiusHost = new Float32Array(1);
  var sortHost = new Int32Array(simulator.barnes.num_nodes + 1);
  var startHost = new Int32Array(simulator.barnes.num_nodes + 1);
  var accxHost = new Float32Array(simulator.barnes.num_nodes + 1);
  var accyHost = new Float32Array(simulator.barnes.num_nodes + 1);
  return Q.all(
      [ simulator.barnes.buffers.x_cords.read(xCoordsHost),
        simulator.barnes.buffers.y_cords.read(yCoordsHost),
        simulator.buffers.curPoints.read(curPointsHost),
        simulator.barnes.buffers.children.read(childrenHost),
        simulator.barnes.buffers.bottom.read(bottomHost),
        simulator.barnes.buffers.count.read(countHost),
        simulator.barnes.buffers.mass.read(massHost),
        simulator.barnes.buffers.maxdepth.read(maxDepthHost),
        simulator.barnes.buffers.radius.read(radiusHost),
        simulator.barnes.buffers.sort.read(sortHost),
        simulator.barnes.buffers.start.read(startHost),
        simulator.barnes.buffers.accx.read(accxHost),
        simulator.barnes.buffers.accy.read(accyHost)
      ]
  )
  .spread( function () {
             //console.log("here2");
             //console.log(xCoordsHost[0]);
             return {
               xCoords: xCoordsHost,
               yCoords: yCoordsHost,
               curPoints: curPointsHost,
               children: childrenHost,
               bottom: bottomHost,
               count: countHost,
               mass: massHost,
               maxDepth: maxDepthHost,
               radius: radiusHost,
               sort: sortHost,
               start: startHost,
               accx: accxHost,
               accy: accyHost
             };
           }
    )
    .catch(function(error) {
      console.log("ERROR in read");
    })
};






module.exports = {

  kernelNames: ["to_barnes_layout", "bound_box", "build_tree", "compute_sums", "sort", "calculate_forces", "move_bodies", "from_barnes_layout", "forceAtlasEdges", "gaussSeidelSpringsGather" /* reuse */],

  // Temporary buffers. These will only be used in barnes hut algorithm.
  tempbuffers: {
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


    //if (anyBarnesArgsChanged) {
      //simulator.kernels.forceAtlasPoints.setArgs(vArr, tArr);
      //simulator.kernels.forceAtlasEdges.setArgs(vArr, tArr);
    //}

  },

  setPoints: function(simulator) {
    simulator.kernels.layout.setArgs(
        graphArgs.concat( //webcl.type ? [simulator.numPoints] : newUint32Array([simulator.numPoints]),
          simulator.buffers.curPoints.buffer,
          tempBuffers.x_cords, tempBuffers.y_cords))
  },

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

    //simulator.kernels.gaussSeidelSpringsGather.setArgs(
        //[   simulator.buffers.forwardsEdges.buffer,
        //simulator.buffers.forwardsWorkItems.buffer,
        //simulator.buffers.curPoints.buffer,
        //simulator.buffers.springsPos.buffer],
        //webcl.type ? [null, null, null, null]
        //: null);
  },

  tick: function (simulator, stepNumber) {
    //if (simulator.barnes.flag) return;
    var debug = false;
    simulator.barnes.flag = 1;
    //simulator.numPoints = 5002;
    //simulator.barnes.num_bodies = 5002;
    //simulator.barnes.num_nodes = 20008;
    // TODO (paden) Can set arguements outside of tick
    curPointsBuffer = simulator.buffers.curPoints.buffer;
    simulator.kernels.to_barnes_layout.setArgs(
        graphArgs.concat(
          webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]),
          curPointsBuffer,
          simulator.barnes.buffers.x_cords.buffer,
          simulator.barnes.buffers.y_cords.buffer,
          simulator.barnes.buffers.mass.buffer,
          simulator.barnes.buffers.blocked.buffer,
          simulator.barnes.buffers.maxdepth.buffer
          ),
        webcl.type ? graphArgs_t.concat(webcl.type.UINT, null, null, null, null, null, null, null) : undefined

        );
    resources = [simulator.buffers.curPoints];
    var layoutKernelSeq = simulator.kernels.to_barnes_layout.call(256, resources);
    return layoutKernelSeq
    .then(function () {
      if (debug) {
      return testLayout(simulator);
      }
    }).then(function() {
        setBarnesArgs(simulator, "bound_box");
        resources = [simulator.buffers.curPoints];
        return simulator.kernels.bound_box.call(256, resources)
    })
    .then(function () {
      testBoundBox(simulator);
    })
    .then( function () {
      if (debug) {
      return readBuffers(simulator).then(function(memObject) {
        printBuffer(memObject.children);
      })
      } else {
        return;
      }
    })
    .then(function () {
      setBarnesArgs(simulator, "build_tree");
      var resources = [simulator.buffers.curPoints];
      return simulator.kernels.build_tree.call(256, resources);
      return;
    })
    //.then(function () {
      //return testBuildTree(simulator);
    //})
    .then( function () {
      if (debug) {
      cpuSummation = CalculateSummation(simulator);
      setBarnesArgs(simulator, "compute_sums");
      resources = [simulator.buffers.curPoints];
      return Q.all([cpuSummation, simulator.kernels.compute_sums.call(256, resources)])
      } else {
        setBarnesArgs(simulator, "compute_sums");
        resources = [simulator.buffers.curPoints];
        return Q.all([simulator.kernels.compute_sums.call(256, resources)])
      }

    })
    .spread( function (cpuMemory) {
      if (debug) {
      return Q.all(
      [
      CheckSummation(simulator, cpuMemory, readBuffers(simulator)),
      CalculateSort(simulator)])
      } else {
        return Q.all([]);
      }
    })
    .spread( function (something, sortMemory) {
      setBarnesArgs(simulator, "sort");
      resources = [simulator.buffers.curPoints];
      sortKernel = simulator.kernels.sort.call(256, resources)
      return Q.all([sortKernel, sortMemory]);
    })
    .spread( function(something, sortMemory) {
      if (debug) {
      gpuMemory = readBuffers(simulator);
      return CheckSorted(simulator, sortMemory, gpuMemory)
      }
    })
    .then( function() {
      if (debug) {
      return CalculateForce(simulator);
      } else {
        return;
      }
    })
    .then(function (cpuMemory) {
      setBarnesArgs(simulator, "calculate_forces");
      resources = [simulator.buffers.curPoints];
      return Q.all([simulator.kernels.calculate_forces.call(256, resources),
                    cpuMemory]);
    })
    .spread ( function (something, cpuMemory) {
      //console.log(cpuMemory);
      if (debug) {
      return CheckForces(simulator, cpuMemory, readBuffers(simulator));
      }
    })
    .then( function() {
      setBarnesArgs(simulator,"move_bodies");
      resources = [simulator.buffers.curPoints];
      return simulator.kernels.move_bodies.call(256, resources);
    })
    //.then( function () {
      //if (true) {
      //return readBuffers(simulator).then(function(memObject) {
        //printBuffer(memObject.curPoints);
      //})
      //} else {
        //return;
      //}
    //})
    .then(function () {
        nextPointsBuffer = simulator.buffers.nextPoints.buffer;
        console.log(nextPointsBuffer);
        simulator.kernels.from_barnes_layout.setArgs(
            graphArgs.concat(
              webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]),
              nextPointsBuffer,
              simulator.barnes.buffers.x_cords.buffer,
              simulator.barnes.buffers.y_cords.buffer,
              simulator.barnes.buffers.mass.buffer,
              simulator.barnes.buffers.blocked.buffer,
              simulator.barnes.buffers.maxdepth.buffer
              ),
            webcl.type ? graphArgs_t.concat(webcl.type.UINT, null, null, null, null, null, null, null) : undefined

              );
        resources = [simulator.buffers.curPoints];
        simulator.tickBuffers(['nextPoints', 'curPoints', 'springsPos'])
        var layoutKernelSeq = simulator.kernels.from_barnes_layout.call(256, resources);
        return layoutKernelSeq;
    })
    .then(function () {
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
        });
      }
    })
    .then(function () {
      if (simulator.numEdges > 0) {

        var resources = [simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems,
        simulator.buffers.curPoints, simulator.buffers.springsPos];

        return simulator.kernels.gaussSeidelSpringsGather.call(simulator.numForwardsWorkItems, resources);
      }
    })
    .then(function () {
      simulator.tickBuffers(['curPoints']);
      return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
    })
    .then( function() {
      //console.log("Done");
    })
    //.catch( function (error) {
      //console.log(error);
    //})
    //.then( function () {
      //simulator.kernels.move_bodies.setArgs(
          //graphArgs.concat(
            //simulator.barnes.buffers.x_cords.buffer,
            //simulator.barnes.buffers.y_cords.buffer,
            //simulator.barnes.buffers.accx.buffer,
            //simulator.barnes.buffers.accy.buffer,
            //simulator.barnes.buffers.children.buffer,
            //simulator.barnes.buffers.mass.buffer,
            //simulator.barnes.buffers.start.buffer,
            //simulator.barnes.buffers.sort.buffer,
            //simulator.barnes.buffers.xmin.buffer,
            //simulator.barnes.buffers.xmax.buffer,
            //simulator.barnes.buffers.ymin.buffer,
            //simulator.barnes.buffers.ymax.buffer,
            //simulator.barnes.buffers.count.buffer,
            //simulator.barnes.buffers.blocked.buffer,
            //simulator.barnes.buffers.step.buffer,
            //simulator.barnes.buffers.bottom.buffer,
            //simulator.barnes.buffers.maxdepth.buffer,
            //simulator.barnes.buffers.radius.buffer,
            //webcl.type ? [simulator.barnes.num_bodies] : new Uint32Array([simulator.barnes.num_bodies]),
            //webcl.type ? [simulator.barnes.num_nodes] : new Uint32Array([simulator.barnes.num_nodes])
            //), webcl.type ? graphArgs_t.concat(
              //[null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
              //null, null, null, webcl.type.INT, webcl.type.INT]) : undefined
            //);
      //resources = [simulator.buffers.curPoints];
      ////return;
      //return simulator.kernels.move_bodies.call(256, resources);
    //})
    //.then( function () {
        //curPointsBuffer = simulator.buffers.curPoints.buffer;
      //simulator.kernels.from_barnes_layout.setArgs(
            //graphArgs.concat(
              //webcl.type ? [simulator.numPoints] : Uint32Array([simulator.numPoints]),
              //simulator.buffers.nextPoints.buffer,
              //simulator.barnes.buffers.x_cords.buffer,
              //simulator.barnes.buffers.y_cords.buffer,
              //simulator.barnes.buffers.mass.buffer
              //));
      //resources = [simulator.buffers.curPoints];
      ////return;
      //return simulator.kernels.from_barnes_layout.call(256, resources);
    //})
    .then(function () {
    });




      }
  };

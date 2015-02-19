var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    cljs  = require('../cl.js');

var BarnesKernelSeq = function (clContext) {

    this.argsToBarnesLayout = [
        'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
        'inputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
        'pointDegrees', 'stepNumber'
    ];

    this.argsBarnes = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
    'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
    'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
    'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
        'width', 'height', 'numBodies', 'numNodes', 'pointForces', 'tau'];

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
        gSpeed: cljs.types.float_t,
        springs: null,
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
        numBodies: cljs.types.uint_t,
        numNodes: cljs.types.uint_t,
        numWorkItems: cljs.types.uint_t,
        globalSpeed: null
    }

    this.toBarnesLayout = new Kernel('to_barnes_layout', this.argsToBarnesLayout,
            this.argsType, 'barnesHut.cl', clContext);

    this.boundBox = new Kernel('bound_box', this.argsBarnes,
            this.argsType, 'barnesHut.cl', clContext);

    this.buildTree = new Kernel('build_tree', this.argsBarnes,
            this.argsType, 'barnesHut.cl', clContext);

    this.computeSums = new Kernel('compute_sums', this.argsBarnes,
            this.argsType, 'barnesHut.cl', clContext);

    this.sort = new Kernel('sort', this.argsBarnes,
            this.argsType, 'barnesHut.cl', clContext);

    this.calculateForces = new Kernel('calculate_forces', this.argsBarnes,
            this.argsType, 'barnesHut.cl', clContext);

    this.move = new Kernel('move_bodies', this.argsBarnes,
            this.argsType, 'barnesHut.cl', clContext);

    this.kernels = [this.toBarnesLayout, this.boundBox, this.buildTree, this.computeSums,
                    this.sort, this.calculateForces, this.move];

    this.setPhysics = function(cfg, mask) {
      _.each(this.kernels, function (k) {
        k.set(_.pick(cfg, k.argNames))
      })
      this.toBarnesLayout.set({flags: mask});
      this.boundBox.set({flags: mask});
      this.buildTree.set({flags: mask});
      this.computeSums.set({flags: mask});
      this.sort.set({flags: mask});
      this.calculateForces.set({flags: mask});
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
    var setupTempBuffers = function(simulator) {
        simulator.resetBuffers(tempBuffers);
        var blocks = 8; //TODO (paden) should be set to multiprocecessor count

        var num_nodes = simulator.numPoints * 4;
        // TODO (paden) make this into a definition
        var WARPSIZE = 16;
        if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
        while ((num_nodes & (WARPSIZE - 1)) != 0) num_nodes++;
        num_nodes--;
        var num_bodies = simulator.numPoints;
        var numNodes = num_nodes;
        var numBodies = num_bodies;
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
                simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'radius'),
                    simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed')
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
                            tempBuffers.numNodes = numNodes;
                            tempBuffers.numBodies = numBodies;
                            return tempBuffers;
                        })
        .catch(function(error) {
            console.log(error);
        });
    };

    this.setEdges = function(simulator, layoutBuffers) {
        var that = this;
        return setupTempBuffers(simulator).then(function (tempBuffers) {

        that.toBarnesLayout.set({xCoords: tempBuffers.x_cords.buffer,
          yCoords:tempBuffers.y_cords.buffer, mass:tempBuffers.mass.buffer,
                            blocked:tempBuffers.blocked.buffer, maxDepth:tempBuffers.maxdepth.buffer,
                            numPoints:simulator.numPoints,
                            inputPositions: simulator.buffers.curPoints.buffer, pointDegrees: simulator.buffers.degrees.buffer});

            function setBarnesKernelArgs(kernel, buffers) {
              kernel.set({xCoords:buffers.x_cords.buffer,
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
                swings:simulator.buffers.swings.buffer,
                tractions:simulator.buffers.tractions.buffer,
                count:buffers.count.buffer,
                blocked:buffers.blocked.buffer,
                bottom:buffers.bottom.buffer,
                step:buffers.step.buffer,
                maxDepth:buffers.maxdepth.buffer,
                radius:buffers.radius.buffer,
                globalSpeed: layoutBuffers.globalSpeed.buffer,
                width:simulator.dimensions[0],
                height:simulator.dimensions[1],
                numBodies:buffers.numBodies,
                numNodes:buffers.numNodes,
                pointForces:simulator.buffers.partialForces1.buffer})
            };
            setBarnesKernelArgs(that.boundBox, tempBuffers);
            setBarnesKernelArgs(that.buildTree, tempBuffers);
            setBarnesKernelArgs(that.computeSums, tempBuffers);
            setBarnesKernelArgs(that.sort, tempBuffers);
            setBarnesKernelArgs(that.calculateForces, tempBuffers);
        });
    };

    this.exec_kernels = function(simulator, stepNumber) {

        var resources = [
            simulator.buffers.curPoints,
            simulator.buffers.forwardsDegrees,
            simulator.buffers.backwardsDegrees,
                simulator.buffers.partialForces1
        ];

        this.toBarnesLayout.set({stepNumber: stepNumber});
        this.boundBox.set({stepNumber: stepNumber});
        this.buildTree.set({stepNumber: stepNumber});
        this.computeSums.set({stepNumber: stepNumber});
        this.sort.set({stepNumber: stepNumber});
        this.calculateForces.set({stepNumber: stepNumber});

        simulator.tickBuffers(['partialForces1']);

        debug("Running Force Atlas2 with BarnesHut Kernels");

        // For all calls, we must have the # work items be a multiple of the workgroup size.
        var that = this;
        return this.toBarnesLayout.exec([256], resources, [256])
        .then(function () {
            return that.boundBox.exec([10*256], resources, [256]);
        })

        .then(function () {
            return that.buildTree.exec([4*256], resources, [256]);
        })

        .then(function () {
            return that.computeSums.exec([4*256], resources, [256]);
        })

        .then(function () {
            return that.sort.exec([4*256], resources, [256]);
        })

        .then(function () {
            return that.calculateForces.exec([40*256], resources, [256]);
        })

        .fail(function (err) {
            console.error('Computing pointForces failed', err, (err||{}).stack);
        });
    };

};

module.exports = BarnesKernelSeq;


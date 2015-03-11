var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    util  = require('../util.js'),
    cljs  = require('../cl.js');

var BarnesKernelSeq = function (clContext) {

    this.argsToBarnesLayout = [
        'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
        'inputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
        'pointDegrees', 'stepNumber', 'WARPSIZE', 'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
    ];

    // All Barnes kernels have same arguements
    this.argsBarnes = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
        'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
        'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
        'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
        'width', 'height', 'numBodies', 'numNodes', 'pointForces', 'tau', 'WARPSIZE',
        'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
    ];

    this.argsMidPoints = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
    'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
    'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
    'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
        'width', 'height', 'numBodies', 'numNodes', 'nextMidPoints', 'tau', 'charge', 'WARPSIZE'];

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
        charge: cljs.types.float_t,
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
        globalSpeed: null,
        nextMidPoints: null,
        WARPSIZE: cljs.types.define,
        THREADS_BOUND: cljs.types.define,
        THREADS_FORCES: cljs.types.define,
        THREADS_SUMS: cljs.types.define
    }

    this.toBarnesLayout = new Kernel('to_barnes_layout', this.argsToBarnesLayout,
            this.argsType, 'barnesHut/toBarnesLayout.cl', clContext);

    this.boundBox = new Kernel('bound_box', this.argsBarnes,
            this.argsType, 'barnesHut/boundBox.cl', clContext);

    this.buildTree = new Kernel('build_tree', this.argsBarnes,
            this.argsType, 'barnesHut/buildTree.cl', clContext);

    this.computeSums = new Kernel('compute_sums', this.argsBarnes,
            this.argsType, 'barnesHut/computeSums.cl', clContext);

    this.sort = new Kernel('sort', this.argsBarnes,
            this.argsType, 'barnesHut/sort.cl', clContext);

    this.calculatePointForces = new Kernel('calculate_forces', this.argsBarnes,
            this.argsType, 'barnesHut/calculatePointForces.cl', clContext);

    this.calculateMidPoints = new Kernel('calculate_forces', this.argsMidPoints,
            this.argsType, 'barnesHut/calculateMidPoints.cl', clContext);


    this.kernels = [this.toBarnesLayout, this.boundBox, this.buildTree, this.computeSums,
                    this.sort, this.calculateForces];
                    this.sort, this.calculatePointsForces, this.calculateMidPoints, this.move];

    this.setPhysics = function(flag) {

        this.toBarnesLayout.set({flags: flag});
        this.boundBox.set({flags: flag});
        this.buildTree.set({flags: flag});
        this.computeSums.set({flags: flag});
        this.sort.set({flags: flag});
        this.calculatePointForces.set({flags: flag});
        this.calculateMidPoints.set({flags: flag});

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
    var setupTempBuffers = function(simulator, warpsize, numPoints) {
        simulator.resetBuffers(tempBuffers);
        var blocks = 8; //TODO (paden) should be set to multiprocecessor count

        if (numPoints === undefined) {
          numPoints = simulator.numPoints;
        }
        var num_nodes = numPoints * 5;
        if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
        while ((num_nodes & (warpsize - 1)) != 0) num_nodes++;
        num_nodes--;
        var num_bodies = numPoints;
        var numNodes = num_nodes;
        var numBodies = num_bodies;
        // TODO (paden) Use actual number of workgroups. Don't hardcode
        var num_work_groups = 128;
        console.log("Num nodes", numNodes);


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
        .fail(util.makeErrorHandler("Setting temporary buffers for barnesHutKernelSequence failed"));
    };

<<<<<<< HEAD
    this.setEdges = function(simulator, layoutBuffers, warpsize, workItems) {
=======
    this.setMidPoints = function(simulator, layoutBuffers, warpsize) {
        var that = this;
        console.log("Set midpoints", simulator.numMidPoints);
        return setupTempBuffers(simulator, warpsize, simulator.numMidPoints).then(function (tempBuffers) {

        that.toBarnesLayout.set({xCoords: tempBuffers.x_cords.buffer,
          yCoords:tempBuffers.y_cords.buffer, mass:tempBuffers.mass.buffer,
                            blocked:tempBuffers.blocked.buffer, maxDepth:tempBuffers.maxdepth.buffer,
                            numPoints:simulator.numMidPoints,
                            inputPositions: simulator.buffers.curMidPoints.buffer,
                            pointDegrees: simulator.buffers.degrees.buffer, WARPSIZE: warpsize});

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
                swings:simulator.buffers.swings.buffer,
                tractions:simulator.buffers.tractions.buffer,
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
                pointForces:simulator.buffers.partialForces1.buffer,
                WARPSIZE:warpsize};

              kernel.set(setArgs);
            };

            setBarnesKernelArgs(that.boundBox, tempBuffers);
            setBarnesKernelArgs(that.buildTree, tempBuffers);
            setBarnesKernelArgs(that.computeSums, tempBuffers);
            setBarnesKernelArgs(that.sort, tempBuffers);
            //setBarnesKernelArgs(that.calculatePointForces, tempBuffers);
            var buffers = tempBuffers;
            console.log(simulator.buffers.nextMidPoints.buffer);

            that.calculateMidPoints.set({xCoords:buffers.x_cords.buffer,
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
                width:simulator.controls.global.dimensions[0],
                height:simulator.controls.global.dimensions[1],
                numBodies:buffers.numBodies,
                numNodes:buffers.numNodes,
                nextMidPoints:simulator.buffers.nextMidPoints.buffer,
                WARPSIZE:warpsize});

        }).fail(util.makeErrorHandler('setupTempBuffers'));
    };


    this.setEdges = function(simulator, layoutBuffers, warpsize) {
>>>>>>> Running barnes hut (repulsion) on midPoints.
        var that = this;
        return setupTempBuffers(simulator, warpsize).then(function (tempBuffers) {

        that.toBarnesLayout.set({xCoords: tempBuffers.x_cords.buffer,
          yCoords:tempBuffers.y_cords.buffer, mass:tempBuffers.mass.buffer,
                            blocked:tempBuffers.blocked.buffer, maxDepth:tempBuffers.maxdepth.buffer,
                            numPoints:simulator.numPoints,
                            inputPositions: simulator.buffers.curPoints.buffer,
                            pointDegrees: simulator.buffers.degrees.buffer,
                            WARPSIZE: warpsize, THREADS_SUMS: workItems.computeSums[1], THREADS_FORCES: workItems.calculateForces[1],
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
                swings:simulator.buffers.swings.buffer,
                tractions:simulator.buffers.tractions.buffer,
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
                pointForces:simulator.buffers.partialForces1.buffer,
                WARPSIZE:warpsize,
                THREADS_SUMS: workItems.computeSums[1],
                THREADS_FORCES: workItems.calculateForces[1],
                THREADS_BOUND: workItems.boundBox[1]};

              kernel.set(setArgs);
            };

            setBarnesKernelArgs(that.boundBox, tempBuffers);
            setBarnesKernelArgs(that.buildTree, tempBuffers);
            setBarnesKernelArgs(that.computeSums, tempBuffers);
            setBarnesKernelArgs(that.sort, tempBuffers);
            setBarnesKernelArgs(that.calculatePointForces, tempBuffers);

        }).fail(util.makeErrorHandler('setupTempBuffers'));
    };

    // TODO (paden) Can probably combine ExecKernel functions
    this.execKernelsMidPoints = function(simulator, stepNumber, workItems) {

        var resources = [
            simulator.buffers.curMidPoints,
            simulator.buffers.forwardsDegrees,
            simulator.buffers.backwardsDegrees,
                simulator.buffers.nextMidPoints
        ];

        this.toBarnesLayout.set({stepNumber: stepNumber});
        this.boundBox.set({stepNumber: stepNumber});
        this.buildTree.set({stepNumber: stepNumber});
        this.computeSums.set({stepNumber: stepNumber});
        this.sort.set({stepNumber: stepNumber});
        this.calculateMidPoints.set({stepNumber: stepNumber});

        simulator.tickBuffers(['nextMidPoints']);

        debug("Running Force Atlas2 with BarnesHut Kernels");

        // For all calls, we must have the # work items be a multiple of the workgroup size.
        var that = this;
        return this.toBarnesLayout.exec([workItems.toBarnesLayout], resources, [256])
        .then(function () {
            return that.boundBox.exec([workItems.boundBox], resources, [256]);
        })

        .then(function () {
            return that.buildTree.exec([workItems.buildTree], resources, [256]);
        })

        .then(function () {
            return that.computeSums.exec([workItems.computeSums], resources, [256]);
        })

        .then(function () {
            return that.sort.exec([workItems.sort], resources, [256]);
        })

        .then(function () {
            return that.calculateMidPoints.exec([workItems.calculateForces], resources, [256]);
        })

        .fail(util.makeErrorHandler("Executing BarnesKernelSeq failed"));
    };

    this.execKernels = function(simulator, stepNumber, workItems) {

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
            return that.calculateForces.exec([workItems.calculateForces[0]], resources, [workItems.calculateForces[1]]);
        })

        .fail(util.makeErrorHandler("Executing BarnesKernelSeq failed"));
    };

};

module.exports = BarnesKernelSeq;


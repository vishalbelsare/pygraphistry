//prebaked script to load uber data
//similar to main.js

var //$ = require('jQuery'),
    NBody = require('./NBody.js'),
    RenderGL = require('./RenderGL.js'),
    SimCL = require('./SimCL.js'),
    MatrixLoader = require('./libs/load.js'),
    Q = require('q'),
    Stats = require('./libs/stats.js'),
    events = require('./SimpleEvents.js'),
    kmeans = require('./libs/kmeans.js');

var webcl = require('node-webcl');
var webgl = require('node-webgl');


var demo = require('./demo.js');


var WIDTH = 600;
var HEIGHT = 600;


    "use strict";

    var graph = null,
        numPoints = 10000,//1024,//2048,//16384,
        num,
        numEdges = numPoints,
        dimensions = [1,1]; //[960,960];



    /*
        graph ->
        {
            physicsControls: {
                charge,gravity,edgeStrength,edgeDistance: v -> ()
            },
            renderingControls: {
                points,edges,midpoints,midedges: () -> ()
            },

        }
    */
    function controls(graph) {
        var physicsControls =
            ['charge', 'gravity', 'edgeStrength', 'edgeDistance']
                .reduce(function (o, lbl) {
                    o[lbl] = function (v) {
                        var cmd = {};
                        cmd[lbl] = v;
                        graph.setPhysics(cmd);
                    };
                    return o;
                }, {});

        /* dumped from playing with web version */
        /*
        physicsControls.charge(-0.00008385510126037207);
        physicsControls.gravity(0.00015448596582229787);
        physicsControls.edgeStrength(0.00015448596582229787);
        physicsControls.edgeDistance(0.0002610812822396834);
        */

        physicsControls.charge      (-0.000029360001841802474);
        physicsControls.gravity     ( 0.00020083175556898723);
        physicsControls.edgeStrength( 4.292198241799153);
        physicsControls.edgeDistance( 0.0000158);


        var renderingControls =
            ['points', 'edges', 'midpoints', 'midedges']
                .reduce(function (o, lbl) {
                    var cmd = {};
                    cmd[lbl] = false;
                    o[lbl] = function (v) {
                        cmd[lbl] = v === undefined ? !cmd[lbl] : v;
                        console.error('setting', cmd);
                        graph.setVisible(cmd);
                    };
                    return o;
                }, {});


        renderingControls.points(false);
        renderingControls.edges(false);
        renderingControls.midpoints(false);
        renderingControls.midedges(true);


        var locks =
            ['lockPoints', 'lockEdges', 'lockMidpoints', 'lockMidedges']
                .reduce(function (o, lbl) {
                    var cmd = {};
                    cmd[lbl] = true;
                    o[lbl] = function (v) {
                        cmd[lbl] = v === undefined ? !cmd[lbl] : v;
                        console.error('setting', cmd);
                        graph.setLocked(cmd);
                    };
                    return o;
                }, {});

        locks.lockPoints(true);
        locks.lockEdges(true);
        locks.lockMidpoints(false);
        locks.lockMidedges(false);

        return {
            physicsControls: physicsControls,
            renderingControls: renderingControls,
            locks: locks
        };
    }







    ///////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////


        console.error('========================== START ===========================================')



        console.log("Running Naive N-body simulation");



        var document = webgl.document();
        document.setTitle('Graphviz');
        var canvas = document.createElement("canvas", WIDTH, HEIGHT);
        canvas.clientWidth = canvas.width = WIDTH;
        canvas.clientHeight = canvas.height = HEIGHT;

        return NBody.create(SimCL, RenderGL, document, canvas, [255,255,255,1.0], dimensions, 3)
        .then(function(createdGraph) {
            graph = createdGraph;
            console.log("N-body graph created.");
        }).then(function () {
            console.debug('~~~~~~~ SETUP')
            return demo.loadDataList(graph);
        })

        .then(function (datalist) {

            var USE_GEO = true;

            if (USE_GEO) {

                console.error('loading data')
                var which = 0;
                console.error('which', datalist[which])
                return datalist[which].loader(graph, datalist[which].f);

            } else {

                var points = demo.createPoints(numPoints, dimensions);
                var edges = demo.createEdges(numEdges, numPoints);

                return Q.all([
                    graph.setPoints(points),
                    points,
                    edges,
                ]).spread(function(graph, points, edges) {
                    graph.setColorMap("test-colormap2.png");
                    return graph.setEdges(edges);
                });

            }


        })


        .then(function () {

            console.debug('=================LOADED')
            console.error('done setup')

        }).then(function () {

            var api = controls(graph);


            console.error('init');

            var animation = demo.animator(graph.renderer.document, graph.tick);
            animation.startAnimation(
                function () {
                    console.error('done, pausing for 10s')
                    setTimeout(function () { console.error('done, exiting'); }, 10 * 1000);
                },
                Math.round(50 * 1000 / 50) /* frames */);

            console.error('ANIMATING')

        }, function (err) {
            console.error('~~~~~could not load geo', err, err.stack);
        }).then(
            function () { console.error('setup done')},
            function (err) { console.error('~~~~~wat', err, err.stack) })

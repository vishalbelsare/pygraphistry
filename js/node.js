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


var WIDTH = 400;
var HEIGHT = 400;


    "use strict";

    var graph = null,
        animating = null,
        numPoints = 1000,//1024,//2048,//16384,
        num,
        numEdges = numPoints,
        dimensions = [1,1]; //[960,960];


    function setup() {
        console.log("Running Naive N-body simulation");



        var document = webgl.document();
        document.setTitle('Graphviz');
        var canvas = document.createElement("canvas", WIDTH, HEIGHT);
        canvas.clientWidth = canvas.width = WIDTH;
        canvas.clientHeight = canvas.height = HEIGHT;



        return NBody.create(SimCL, RenderGL, canvas, dimensions, 3)
        .then(function(createdGraph) {
            graph = createdGraph;
            console.log("N-body graph created.");

            var points = createPoints(numPoints, dimensions);
            var edges = createEdges(numEdges, numPoints);

            return Q.all([
                graph.setPoints(points),
                points,
                edges,
            ]);
        })
        .spread(function(graph, points, edges) {
            graph.setColorMap("test-colormap2.png")
                .then(
                    function () { console.error('COLOR')},
                    function (err) { console.error('COLOR EXN:', err, err.stack)});
            console.error('ff')
            return graph.setEdges(edges);
        })
        .then(function(graph) {
                        console.error('ok, setup now tick')

            return graph.tick();
        });
    }


    function animatePromise(promise) {
        console.error('===============STEPPING')
        try {
        return promise()
        .then(function() {
            if(animating){
                console.error('ANIMATE setTimeout')
                return setTimeout(function() {
                        animatePromise(promise);
                    }, 0);
            } else {
                console.error("ANIMATE DONE")
                return null;
            }
        }, function(err) {
            console.error("Error during animation:", err);
        });
         } catch (e) {
            console.error('BAD STEP', e);
            throw e;
         }
    }


    function stopAnimation() {
        animating = false;
    }


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
        physicsControls.charge(0.1);
        physicsControls.gravity(0.1);
        physicsControls.edgeStrength(0.1);
        physicsControls.edgeDistance(0.1);

        var renderingControls =
            ['points', 'edges', 'midpoints', 'midedges']
                .reduce(function (o, lbl) {
                    var cmd = {};
                    cmd[lbl] = false;
                    o[lbl] = function () {
                        cmd[lbl] = !cmd[lbl];
                        graph.setVisible(cmd);
                    };
                    return o;

                }, {});
        //on by default
        for (var i in renderingControls) {
            renderingControls[i]();
        }


        var locks =
            ['lockPoints', 'lockEdges', 'lockMidpoints', 'lockMidedges']
                .reduce(function (o, lbl) {
                    var cmd = {};
                    cmd[lbl] = true;
                    o[lbl] = function () {
                        cmd[lbl] = !cmd[lbl];
                        graph.setLocked(cmd);
                    };
                    return o;
                }, {});
        //unlocked endpoints by default (unlock all, relock mid)
        for (var i in locks) {
            locks[i]();
        }
        locks.lockMidedges();
        locks.lockMidpoints();


        return {
            physicsControls: physicsControls,
            renderingControls: renderingControls,
            locks: locks
        };
    }




    function loadDataList(clGraph) {
        // Given a URI of a JSON data index, return an array of objects, with keys for display name,
        // file URI, and data size
        function getDataList(listURI) {
            return MatrixLoader.ls(listURI)
            .then(function (files) {
                var listing = [];

                files.forEach(function (file, i) {
                    listing.push({
                        f: file.f,
                        base: file.f.split(/\/|\./)[file.f.split(/\/|\./).length - 3],
                        KB: file.KB,
                        size: file.KB > 1000 ? (Math.round(file.KB / 1000) + " MB") : (file.KB + " KB")
                    });
                });

                return listing;
            });
        }


        return getDataList("data/geo.json")
        .then(function(geoList){
            return geoList.map(function(fileInfo) {
                fileInfo["base"] = fileInfo.base + ".geo";
                fileInfo["loader"] = loadGeo;
                return fileInfo;
            });
        });
    }



    /**
     * Loads the matrix data at the given URI into the NBody graph.
     */
    function loadMatrix(clGraph, graphFileURI) {
        var graphFile;

        return MatrixLoader.loadBinary(graphFileURI)
        .then(function (v) {
            graphFile = v;

            var points = createPoints(graphFile.numNodes, clGraph.dimensions);

            return clGraph.setPoints(points);
        })
        .then(function() {
            return clGraph.setEdges(graphFile.edges);
        })
        .then(function() {
            return clGraph.tick();
        });
    }


    function loadGeo(clGraph, graphFileURI) {
        var processedData;

        return MatrixLoader.loadGeo(graphFileURI)
        .then(function(geoData) {
            processedData = MatrixLoader.processGeo(geoData);

            console.error('============PROCESSED')
            for (var i in processedData) {
                console.error('proc', i, typeof(processedData[i]))

            }
            console.error('nodes/edges', processedData.points.length, processedData.edges.length)

            return clGraph.setPoints(processedData.points);
        })
        .then(function() {

            var position = function (points, edges) {
                return edges.map(function (pair){
                    var start = points[pair[0]];
                    var end = points[pair[1]];
                    return [start[0], start[1], end[0], end[1]];
                });
            };
            var k = 6; //need to be <= # supported colors, currently 9
            var steps =  50;
            var positions = position(processedData.points, processedData.edges);
            var clusters = kmeans(positions, k, steps); //[ [0--1]_4 ]_k
            clGraph.setColorMap("test-colormap2.png", {clusters: clusters, points: processedData.points, edges: processedData.edges});

            return clGraph.setEdges(processedData.edges);
        })
        .then(function() {
            return clGraph.tick();
        }, function (err) {
            console.error('WAT', err, err.stack)
        });
    }


    // Generates `amount` number of random points
    function createPoints(amount, dim) {
        // Allocate 2 elements for each point (x, y)
        var points = [];

        for(var i = 0; i < amount; i++) {
            points.push([Math.random() * dim[0], Math.random() * dim[1]]);
        }

        return points;
    }


    function createEdges(amount, numNodes) {
        var edges = [];
        // This may create duplicate edges. Oh well, for now.
        for(var i = 0; i < amount; i++) {
            var source = (i % numNodes),
                target = (i + 1) % numNodes;

            edges.push([source, target]);
        }

        return edges;
    }


    ///////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////


        setup()
        .then(function () {
            console.error('~~~~~~~ SETUP')
            return loadDataList(graph);
        })
        .then(function (datalist) {

            console.error('loading data')
            return datalist[0].loader(graph, datalist[0].f);

        }).then(function (loaded) {

            console.error('LOADED')
            var api = controls(graph);

            console.error('done setup')

            animating = true;
            //stopAnimation();
            //animatePromise(graph.tick);

            console.error('ANIMATING')

        }, function (err) {
            console.error('could not load geo', err, err.stack);
        }).then(function () { console.error('setup done')},
        function (err) {
            console.error('wat', err, err.stack)
        })

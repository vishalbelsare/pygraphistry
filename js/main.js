require.config({
    paths: {
        "jQuery": "libs/jquery-2.1.0",
        "Q": "libs/q",
        "glMatrix": "libs/gl-matrix",
        "MatrixLoader": "libs/load",
        "Stats": "libs/stats.beautified",
        "Long": "libs/Long",
        "kmeans": "libs/kmeans"
    },
    shim: {
        "jQuery": {
            exports: "$"
        },
        "Stats": {
            exports: "Stats"
        }
    }
});

require(["jQuery", "NBody", "RenderGL", "SimCL", "MatrixLoader", "Q", "Stats", "SimpleEvents", "kmeans"],
function($, NBody, RenderGL, SimCL, MatrixLoader, Q, Stats, events, _ /*kmeans*/) {
    "use strict";

    var graph = null,
        animating = null,
        numPoints = 1000,//1024,//2048,//16384,
        num,
        numEdges = numPoints,
        dimensions = [1,1]; //[960,960];


    function setup() {
        console.log("Running Naive N-body simulation");

        return NBody.create(SimCL, RenderGL, $("#simulation")[0], dimensions, 3)
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
            graph.setColorMap("test-colormap2.png");
            return graph.setEdges(edges);
        })
        .then(function(graph) {
            var fpsTotal = new Stats();
            fpsTotal.setMode(0);
            $("#fpsTotal").append(fpsTotal.domElement);
            events.listen("tickBegin", function() { fpsTotal.begin(); });
            events.listen("tickEnd", function() { fpsTotal.end(); });

            var fpsSim = new Stats();
            fpsSim.setMode(1);
            $("#fpsSim").append(fpsSim.domElement);
            events.listen("simulateBegin", function() { fpsSim.begin(); });
            events.listen("simulateEnd", function() { fpsSim.end(); });

            var fpsRender = new Stats();
            fpsRender.setMode(1);
            $("#fpsRender").append(fpsRender.domElement);
            events.listen("renderBegin", function() { fpsRender.begin(); });
            events.listen("renderEnd", function() { fpsRender.end(); });

            var animButton = $("#anim-button");
            var stepButton = $("#step-button");

            function startAnimation() {
                animating = true;
                animButton.text("Stop");
                stepButton.prop("disabled", true);

                animButton.on("click", function() {
                    stopAnimation();
                    stepButton.prop("disabled", false);
                    animButton.text("Animate");
                    animButton.on("click", startAnimation);
                });

                animatePromise(graph.tick);
            }
            animButton.on("click", startAnimation);

            stepButton.on("click", function() {
                if(animating) {
                    return false;
                }

                stepButton.prop("disabled", true);

                graph.tick()
                .then(function() {
                    stepButton.prop("disabled", false);
                });
            });

            animButton.prop("disabled", false);
            stepButton.prop("disabled", false);

            return graph.tick();
        });
    }


    function animatePromise(promise) {
        return promise()
        .then(function() {
            if(animating){
                return window.setTimeout(function() {
                        animatePromise(promise);
                    }, 0);
            } else {
                return null;
            }
        }, function(err) {
            console.error("Error during animation:", err);
        });
    }


    function stopAnimation() {
        animating = false;
    }


    function bindSliders(graph) {
        $('#charge').on('change', function (e) {
        var v = $(this).val();
        var res = 0.1;
        for (var i = 0; i < (100-v); i++) res /= 1.3;
        var scaled = -1 * res;
//      console.log('charge', v, '->', scaled);
        graph.setPhysics({charge: scaled});
        });
        $('#gravity').on('change', function (e) {
        var v = $(this).val();
        var res = 100.0;
        for (var i = 0; i < (100-v); i++) res /= 1.3;
        var scaled = 1 * res;
//      console.log('gravity', v, '->', scaled);
        graph.setPhysics({gravity: scaled});
        });
        $('#strength').on('change', function (e) {
        var v = $(this).val();
        var res = 100.0;
        for (var i = 0; i < (100-v); i++) res /= 1.3;
        var scaled = 1 * res;
//      console.log('strength', v, '->', scaled);
        graph.setPhysics({edgeStrength: scaled});
        });
        $('#length').on('change', function (e) {
        var v = $(this).val();
        var res = 100.0;
        for (var i = 0; i < (100-v); i++) res /= 1.3;
        var scaled = 1 * res;
//      console.log('length', v, '->', scaled);
        graph.setPhysics({edgeDistance: scaled});
        });

        ['points', 'edges', 'midpoints', 'midedges'].forEach(function (name) {
            function bang () {
                var obj = {};
                obj[name] = $(this).is(':checked');
                graph.setVisible(obj);
            };
            $('#' + name).on('change', bang);
            bang.call($('#' + name));
        });

        ['lockPoints', 'lockEdges', 'lockMidpoints', 'lockMidedges'].forEach(function (name) {
            function bang () {
                var obj = {};
                obj[name] = $(this).is(':checked');
                graph.setLocked(obj);
            }
            $('#' + name).on('change', bang);
            bang.call($('#' + name));
        });

    }


    /**
     * Populate the data list dropdown menu with available data, and setup actions to load the data
     * when the user selects one of the options.
     *
     * @param clGraph - the NBody graph object created by NBody.create()
     */
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

        var dataList = [];

        return getDataList("data/geo.json")
        .then(function(geoList){
            geoList = geoList.map(function(fileInfo) {
                fileInfo["base"] = fileInfo.base + ".geo";
                fileInfo["loader"] = loadGeo;
                return fileInfo;
            });

            dataList = dataList.concat(geoList);

            return getDataList("data/matrices.binary.json");
        })
        .then(function(matrixList){
            matrixList = matrixList.map(function(fileInfo) {
                fileInfo["base"] = fileInfo.base + ".mtx";
                fileInfo["loader"] = loadMatrix;
                return fileInfo;
            });

            dataList = dataList.concat(matrixList);

            var dataEl = $("#datasets");

            dataList.forEach(function(dataSet, i) {
                dataEl.append($('<option></option>')
                    .attr('value', i)
                    .text(dataSet.base + " (" + dataSet.size + ")")
                );
            })

            // Set the starting selection of the <select> control to be blank, since we start with
            // random data loaded, not a matrix
            dataEl.prop('selectedIndex', -1)

            $('#datasets')
            .on('change', function () {
                var dataSet = dataList[parseInt(this.value)];

                return dataSet.loader(clGraph, dataSet.f)
                .catch(function(err) {
                    console.error("Error loading matrix:", err);
                    throw err;
                })
            });

            return dataList;
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
            $('#filenodes').text('Nodes: ' + v.numNodes);
            $('#fileedges').text('Edges: ' + v.numEdges);

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
            $('#filenodes').text('Nodes: ' + processedData.points.length);
            $('#fileedges').text('Edges: ' + processedData.edges.length);

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
        })
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


    setup().
    then(function() {
        return loadDataList(graph);
    }, function(err) {
        console.error("Error setting up animation:", err);
    }).then(function () {
        return bindSliders(graph);
    });
});

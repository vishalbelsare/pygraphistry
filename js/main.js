var $ = require('jQuery'),
    NBody = require('./NBody.js'),
    RenderGL = require('./RenderGL.js'),
    SimCL = require('./SimCL.js'),
    MatrixLoader = require('./libs/load.js'),
    Q = require('q'),
    Stats = require('./libs/stats.js'),
    events = require('./SimpleEvents.js'),
    kmeans = require('./libs/kmeans.js'),
    demo = require('./demo.js')



    "use strict";

    var graph = null,
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

            var points = demo.createPoints(numPoints, dimensions);
            var edges = demo.createEdges(numEdges, numPoints);

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

            var animation = demo.animator(document, graph.tick);

            function startAnimation() {

                animButton.text("Stop");
                stepButton.prop("disabled", true);

                animButton.off().on("click", function() {
                    animation.stopAnimation();
                    stepButton.prop("disabled", false);
                    animButton.text("Animate");
                    animButton.off().on("click", startAnimation);
                });

                animation.startAnimation();
            }
            animButton.on("click", startAnimation);

            stepButton.on("click", function() {

                animation.stopAnimation();

                stepButton.prop("disabled", true);

                graph.tick()
                .then(function() {
                    stepButton.prop("disabled", false);
                });
            });

            animButton.prop("disabled", false);
            stepButton.prop("disabled", false);

            //return graph.tick();
            return graph;
        });
    }



    function bindSliders(graph) {
        console.debug('setting physics');

        $('#charge').on('change', function (e) {
            var v = $(this).val();
            var res = 0.1;
            for (var i = 0; i < (100-v); i++) res /= 1.3;
            var scaled = -1 * res;
            //console.log('charge', v, '->', scaled);
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


    ///////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////

    function renderDataList(dataList, graph) {

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

            return dataSet.loader(graph, dataSet.f)
                .then(function () {
                    graph.tick();
                })
            .catch(function(err) {
                console.error("Error loading matrix:", err);
                throw err;
            })
        });
    }



    $(function () {

        setup().
        then(function() {
            console.debug("SETUP, LOADING DATA")
            return demo.loadDataList(graph);
        }).then(function (dataList) {
            renderDataList(dataList, graph);
        }).then(function () {
            console.debug("LOADED DATA, BINDING")
            return bindSliders(graph);
        }).then(function () {
            graph.tick(); //initial view
        }).then(
            function () { console.debug('DONE') },
            function (err) { console.error('oops', err, err.stack) })

    });
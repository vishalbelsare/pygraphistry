"use strict";

var fs = require('fs');

var debug = require("debug")("StreamGL:data");
var _ = require('underscore');

var MatrixLoader = require('./libs/load.js'),
    kmeans = require('./libs/kmeans.js');


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

function loadRectangle(rows, columns, graph) {
    debug("Loading rectangle", rows, columns);

    var points =
        _.flatten(
            _.range(0, rows)
                .map(function (row) {
                    return _.range(0, columns)
                        .map(function (column) {
                            return [column, row];
                        });
                }),
            true);
    return graph.setPoints(new Float32Array(_.flatten(points)))
        .then(function () {
            return graph.setEdges(new Uint32Array([0,1]));
        });
}

function loadSocioPLT(graph) {
    debug("Loading SocioPLT");

    var data = require('./libs/socioplt/generateGraph.js');


    var nodesPerRow = Math.floor(Math.sqrt(data.nodes.length));
    var points =
        data.nodes.map(
            function (_, i) {
                return [i % nodesPerRow, Math.floor(i / nodesPerRow)];
            });
    var pointSizes = new Uint8Array(_.pluck(data.nodes, 'size'));
    var pointColors = new Uint32Array(_.pluck(data.nodes, 'color'));

    //data.edges = [{src: 0, dst: 1}];

    var edges = _.flatten(data.edges.map(function (edge) {
            return [edge.src, edge.dst];
        }));
    var edgeColors = _.flatten(data.edges.map(function (edge) {
            return [edge.color, edge.color];
        }));

        //graph.setVisible({edgeStrength: -10});
        //physicsControls.gravity     ( 0.020083175556898723);
        //physicsControls.edgeStrength( 4.292198241799153);
        //physicsControls.edgeDistance( 0.0000158);



    return graph.setPoints(new Float32Array(_.flatten(points)), pointSizes, pointColors)
        .then(function () {
            return graph.setEdges(
                new Uint32Array(edges),//new Uint32Array(_.flatten(edges).map(function (idx, i) { return idx; })),
                new Uint32Array(edgeColors));
        })
        .then(function () {


            graph.setPhysics({forceAtlas: 0});
            graph.setLocked({
                lockPoints:     false,
                lockEdges:      false,
                lockMidpoints:  true,
                lockMidedges:   true
            });

            graph.setPhysics({
                charge: -0.001,
                gravity: 0.1,
                edgeStrength: 0.001,
                edgeDistance: 0.001
            });


            return graph;
        }, function (err) {
            throw err;
        })
}


function loadGeo(graph, graphFileURI) {

    debug("Loading Geo");

    return MatrixLoader.loadGeo(graphFileURI)
    .then(function(geoData) {
        var processedData = MatrixLoader.processGeo(geoData, 0.3);

        debug("Processed %d/%d nodes/edges", processedData.points.length, processedData.edges.length);

        return graph.setPoints(processedData.points)
            .then(_.constant(processedData))
    })
    .then(function(processedData) {

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

        return graph
                .setColorMap("test-colormap2.png", {clusters: clusters, points: processedData.points, edges: processedData.edges})
                .then(function () {
                    debug("Setting edges");
                    return graph.setEdges(processedData.edges);
                });
    })
    .then(function() {
        debug("Done setting geo points, edges");
        return graph;
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
        debug("  geolist");
        geoList = geoList.map(function(fileInfo) {
            fileInfo["base"] = fileInfo.base + ".geo";
            fileInfo["loader"] = loadGeo;
            return fileInfo;
        });

        dataList = dataList.concat(geoList);
    })
    .then(function () {
        debug("  socioPLT");
        dataList.push({
            base: "socioPLT.json",
            loader: loadSocioPLT,
            f: "socioPLT.json",
            KB: "??",
            size: "??"
       });
    })
    .then(function () {
        debug("  rectangle");
        dataList.push({
            base: "rectangle",
            loader: loadRectangle.bind('', 100, 100),
            f: "??",
            KB: "??",
            size: "??"
        });
    })
    .then(function () {
        var matricesIndexFilePath = 'data/matrices.binary.json';
        if(fs.existsSync(matricesIndexFilePath)) {
            return getDataList(matricesIndexFilePath);
        } else {
            return [];
        }
    })
    .then(function(matrixList){
        debug("  matrixlist");
        matrixList = matrixList.map(function(fileInfo) {
            fileInfo["base"] = fileInfo.base + ".mtx";
            fileInfo["loader"] = loadMatrix;
            return fileInfo;
        });

        dataList = dataList.concat(matrixList);

        return dataList;
    });
}


/**
 * Loads the matrix data at the given URI into the NBody graph.
 */
function loadMatrix(graph, graphFileURI) {
    var graphFile;

    debug("Loading file %s", graphFileURI);

    return MatrixLoader.loadBinary(graphFileURI)
    .then(function (v) {
        graphFile = v;
        if (typeof($) != 'undefined') {
            $('#filenodes').text('Nodes: ' + v.numNodes);
            $('#fileedges').text('Edges: ' + v.numEdges);
        }

        var points = createPoints(graphFile.numNodes, graph.dimensions);

        return graph.setPoints(points);
    })
    .then(function() {
        return graph.setEdges(graphFile.edges);
    })
    .then(function() {
        return graph;
    });
}




module.exports = {
    createPoints: createPoints,
    createEdges: createEdges,
    loadGeo: loadGeo,
    loadDataList: loadDataList,
    loadRectangle: loadRectangle
};

"use strict";

var MatrixLoader = require('./libs/load.js');
var kmeans = require('./libs/kmeans.js');
var _ = require('underscore');


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


function loadGeo(graph, graphFileURI) {

    console.debug('~~~~~~~~~~~~~~ GEO ~~~~~~~~~~~~~~~~~~~~~~~~~~~~')

    return MatrixLoader.loadGeo(graphFileURI)
    .then(function(geoData) {
        var processedData = MatrixLoader.processGeo(geoData);

        console.debug('============PROCESSED')
        console.debug('nodes/edges', processedData.points.length, processedData.edges.length)

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
                    console.debug('NOW SETTING EDGES')
                    return graph.setEdges(processedData.edges);
                });
    })
    .then(function() {
        console.debug("SET GEO POINTS, EDGES");
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
        console.debug("  geolist")
        geoList = geoList.map(function(fileInfo) {
            fileInfo["base"] = fileInfo.base + ".geo";
            fileInfo["loader"] = loadGeo;
            return fileInfo;
        });

        dataList = dataList.concat(geoList);

        return getDataList("data/matrices.binary.json");
    })
    .then(function(matrixList){
        console.debug('  matrixlist');
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

    console.debug('LOADING FILE', graphFileURI);

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
    loadDataList: loadDataList
};

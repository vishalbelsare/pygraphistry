"use strict";

var fs = require('fs');
var path = require('path');
var Q = require('q');
var debug = require("debug")("graphistry:graph-viz:data-loader");
var _ = require('underscore');

var MatrixLoader = require('./libs/MatrixLoader.js'),
    VGraphLoader = require('./libs/VGraphLoader.js'),
    kmeans = require('./libs/kmeans.js');

var loaders = {
    "vgraph": VGraphLoader.load,
    "matrix" : loadMatrix,
    "random" : loadRandom,
    "OBSOLETE_geo": loadGeo,
    "OBSOLETE_socioPLT" : loadSocioPLT,
    "OBSOLETE_rectangle" : loadRectangle
};

function loadDataIntoSim(graph, dataConfig) {
    return loadDataList(dataConfig.listURI).then(function (datalist) {
        // Try to find a dataset by name first
        if (dataConfig.name) {
            debug("Loading dataset by name");
            var match = _.find(datalist, function (dataset) {return dataset.name == dataConfig.name;});
            if (match)
                return loadDataSet(graph, match);
        }
        
        // Then by index
        var idx = parseInt(dataConfig.idx)
        if (!isNaN(idx) && idx < datalist.length) {
            debug("Loading dataset by index")
            return loadDataSet(graph, datalist[idx]);
        }
          
        // Otherwise the first listed
        debug("Loading first dataset")
        return loadDataSet(graph, datalist[0]);
    });
}


// Given a URI of a JSON data index, return an array of objects, with keys for display name,
// file URI, and data size
function fetchDataList(listURI) {
    debug("Listing datasets in " + listURI);
    var file = (typeof(window) == 'undefined') ?
                Q.denodeify(require('fs').readFile)(listURI, {encoding: 'utf8'}) :
                Q($.ajax(listURI, {dataType: "text"}));

    return file
        .then(function (s) {
            return _.map(JSON.parse(s), function (dataset) {
                if ("file" in dataset) { // Resolve relative paths
                    var parts = listURI.split('/');
                    parts.pop();
                    var base = parts.join('/') + '/';
                    dataset.file = base + dataset.file;
                }
                return dataset;
            });
        });
}


function normalizeDataset(dataset) {
    var defaultFields = {
        "KB" : "?", 
        "name": "?",
        "file" : "none",
        "config": {}
    };

    for (var field in defaultFields) {
        if (!(field in dataset))
            dataset[field] = defaultFields[field];
    }

    return dataset;
}


/**
 * Populate the data list dropdown menu with available data, and setup actions to load the data
 * when the user selects one of the options.
 */
function loadDataList(dataListURI) {
    return fetchDataList(path.resolve(__dirname, '..', dataListURI))
        .then(function (datalist) {
            return _.map(datalist, normalizeDataset);
        });
}


function loadDataSet(graph, dataset) {
    debug("Loading data: %o", dataset);
    return loaders[dataset.type](graph, dataset);
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


function loadRandom(graph, dataset) {
    var cfg = dataset.config
    var points = createPoints(cfg.npoints, cfg.dimensions);
    var edges = createEdges(cfg.nedges, cfg.npoints);

    return graph.setPoints(points).then(function() {
        graph.setColorMap("test-colormap2.png");
        return graph.setEdgesAndColors(edges);
    });
}


function loadRectangle(graph, dataset) {
    var cfg = dataset.config
    debug("Loading rectangle", cfg.rows, cfg.columns);

    var points =
        _.flatten(
            _.range(0, cfg.rows)
                .map(function (row) {
                    return _.range(0, cfg.columns)
                        .map(function (column) {
                            return [column, row];
                        });
                }),
            true);
    return graph.setPoints(new Float32Array(_.flatten(points)))
        .then(function () {
            return graph.setEdgesAndColors(new Uint32Array([0,1]));
        });
}


function loadSocioPLT(graph, dataset) {
    debug("Loading SocioPLT");

    var data = require('./libs/socioplt/generateGraph.js').process(dataset.file);

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
            return graph.setEdgesAndColors(
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


function loadGeo(graph, dataset) {
    debug("Loading Geo");

    return MatrixLoader.loadGeo(dataset.file)
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
                    return graph.setEdgesAndColors(processedData.edges);
                });
    })
    .then(function() {
        debug("Done setting geo points, edges");
        return graph;
    });
}


/**
 * Loads the matrix data at the given URI into the NBody graph.
 */
function loadMatrix(graph, dataset) {
    var graphFile;

    debug("Loading file %s", dataset.file);

    return MatrixLoader.loadBinary(dataset.file)
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
        return graph.setEdgesAndColors(graphFile.edges);
    })
    .then(function() {
        return graph;
    });
}


module.exports = {
    createPoints: createPoints,
    createEdges: createEdges,
    loadDataIntoSim: loadDataIntoSim
};

// vim: set et ff=unix ts=8 sw=4 fdm=syntax: 

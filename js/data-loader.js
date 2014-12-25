"use strict";

var fs = require('fs');
var path = require('path');
var Q = require('q');
var debug = require("debug")("graphistry:graph-viz:data:data-loader");
var _ = require('underscore');
var config  = require('config')();
var zlib = require("zlib");

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

/**
 * Kick off the download process. This checks the 
 * modified time and fetches from S3 accordingly.
**/
function downloadDataset(datasetname) {
    debug("Attempting to load dataset " + datasetname);
    var params = {
      Bucket: config.BUCKET,
      Key: datasetname
    };

    // look at date on disk
    var res = Q.defer();
    fs.stat('/tmp/' + datasetname, function(err, data){

        // The data exists locally - check if it's recent or 
        // not using the IfModifiedSince header
        if (!err) {
            params.IfModifiedSince = data.mtime;
        }

        // Attempt the download
        config.S3.getObject(params, function(err, data) {
            // Error getting the file from S3, either because the on 
            // disk version is newer or the S3 connection is unavailable
            // In this case, read the data from disk.
            if (err) {
                debug("Loading " + datasetname + " from cache");

                // Read the metadata
                fs.readFile('/tmp/' + datasetname + '.metadata', function (err, metadata) {
                    if (err) { debug(err); }

                    // Read the buffer data
                    fs.readFile('/tmp/' + datasetname, function (err, buffer) {
                        if (err) { debug(err); }

                        // Simulate an S3 object
                        var result = {}
                        result.Metadata = JSON.parse(metadata);
                        result.Metadata.name = datasetname;
                        result.Body = buffer
                        res.resolve(result);
                    });
                });
            } else {
                if (data.Metadata.config != 'undefined') {
                    data.Metadata.config = JSON.parse(data.Metadata.config);
                }
                data.Metadata.name = datasetname;

                // Unzip the data and save to disk as a cacche
                Q.denodeify(zlib.gunzip)(data.Body)
                .then(function (unzipped) {
                    data.Body = unzipped;

                    // Write the metadata to disk
                    fs.writeFile("/tmp/" + datasetname + '.metadata', JSON.stringify(data.Metadata), function(err) {
                        if(err) {
                            debug("Couldn't save metadata to cache" + err);
                        } else {
                            debug("Saved " + datasetname + " metadata to cache");
                        }
                    });

                    // Write the data to disk
                    fs.writeFile("/tmp/" + datasetname, data.Body, function(err) {
                        if(err) {
                            debug("Couldn't save data to cache" + err);
                        } else {
                            debug("Saved " + datasetname + " to cache");
                        }
                    });

                    res.resolve(data);
                })
            }
        })
    });
    return res.promise;
}

function loadDatasetIntoSim(graph, dataset) {
    debug("Loading data: %o", dataset);
    // TODO: This stuff should come from Mongo, not S3
    graph.metadata = dataset.Metadata;
    return loaders[dataset.Metadata.type](graph, dataset);
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
    var cfg = dataset.Metadata.config
    var points = createPoints(cfg.npoints, cfg.dimensions);
    var edges = createEdges(cfg.nedges, cfg.npoints);

    return graph.setPoints(points).then(function() {
        graph.setColorMap("test-colormap2.png");
        return graph.setEdges(edges);
    });
}


function loadRectangle(graph, dataset) {
    var cfg = dataset.Metadata.config
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
            return graph.setEdges(new Uint32Array([0,1]));
        });
}


function loadSocioPLT(graph, dataset) {
    debug("Loading SocioPLT");

    var data = require('./libs/socioplt/generateGraph.js').process(dataset.Body);

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

    return Q(MatrixLoader.loadGeo(dataset.Body))
     .then(function(geoData) {
        var processedData = MatrixLoader.processGeo(geoData, 0.3);

        debug("Processed %d/%d nodes/edges", processedData.points.length, processedData.edges.length);

        return graph.setPoints(processedData.points)
            .then(function () {
                return graph.setLabels(processedData.points.map(function (v, i) {
                    return '<b>' + i + '</b><hr/>' + v[0].toFixed(4) + ', ' + v[1].toFixed(4);
                }));
            })
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
 * Loads the matrix data at the given URI into the NBody graph.
 */
function loadMatrix(graph, dataset) {
    var graphFile;

    debug("Loading dataset %s", dataset.Body);

    var v = MatrixLoader.loadBinary(dataset.Body)
    var graphFile = v;
    if (typeof($) != 'undefined') {
        $('#filenodes').text('Nodes: ' + v.numNodes);
        $('#fileedges').text('Edges: ' + v.numEdges);
    }

    var points = createPoints(graphFile.numNodes, graph.dimensions);

    return graph.setPoints(points)
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
    loadDatasetIntoSim: loadDatasetIntoSim,
    downloadDataset: downloadDataset
};

// vim: set et ff=unix ts=8 sw=4 fdm=syntax: 

var vgraph   = require('./vgraph.js');
var vgwriter = require('../node_modules/graph-viz/js/libs/VGraphWriter.js');
var debug    = require('debug')('graphistry:etl:etl');

// Convert JSON edgelist to VGraph then upload VGraph to S3
// JSON * HTTP.Response
function etl(msg, res) {
    debug('ETL for', msg.name);
    //debug('Data', msg.labels);

    var vg = vgraph.fromEdgeList(
        msg.graph,
        msg.labels,
        msg.bindings.sourceField,
        msg.bindings.destinationField,
        msg.bindings.idField,
        msg.name
    );

    var metadata = {
        name: msg.name,
        type: 'vgraph',
        config: {
            simControls: 'netflow',
            scene: 'netflow',
            mapper: 'debugMapper'
        }
    };

    vgwriter.uploadVGraph(vg, metadata).done(function () {
        res.send({
            sucess: true,
            datasetName: metadata.name
        });
    })
}

// Handler for ETL requests on central/etl
function post(req, res) {
    var data = "";

    req.on('data', function (chunk) {
        data += chunk;
    });

    req.on('end', function () {
        try {
            etl(JSON.parse(data), res);
        } catch (err) {
            debug('Reporting failure', err, (err || {}).stack);
            res.send({
                sucess: false,
                msg: JSON.stringify(err)
            });
        }
    });
}

module.exports = {
    post: post
}

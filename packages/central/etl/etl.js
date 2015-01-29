var debug    = require('debug')('graphistry:central:etl:etl');
var _        = require('underscore');
var Q        = require('q');

var vgraph   = require('./vgraph.js');
var vgwriter = require('../node_modules/graph-viz/js/libs/VGraphWriter.js');
var config   = require('config')();


// Convert JSON edgelist to VGraph then upload VGraph to S3 and local /tmp
// JSON * HTTP.Response
function etl(msg, res) {
    var name = decodeURIComponent(msg.name);
    debug('ETL for', msg.name);
    //debug('Data', msg.labels);

    var vg = vgraph.fromEdgeList(
        msg.graph,
        msg.labels,
        msg.bindings.sourceField,
        msg.bindings.destinationField,
        msg.bindings.idField,
        name
    );

    var metadata = {
        name: name,
        type: 'vgraph',
        config: {
            device: 'all',
            scene: 'netflow',
            controls: 'gauss',
            mapper: 'splunkMapper'
        }
    };
    return Q().then(function () {
        if (config.ENVIRONMENT === 'local') {
            return vgwriter.cacheVGraph(vg, metadata);
        }
    }).then(function () {
        vgwriter.uploadVGraph(vg, metadata).fail(function () {
            console.log('S3 Upload failed');
        });
    }).then(_.constant(msg));
}

// Handler for ETL requests on central/etl
function post(req, res) {
    var data = "";

    req.on('data', function (chunk) {
        data += chunk;
    });

    req.on('end', function () {
        var fail = function (err) {
            console.error('etl post fail', (err||{}).stack);
            res.send({
                success: false,
                msg: JSON.stringify(err)
            });
        };

        try {
            etl(JSON.parse(data))
                .done(
                    function (msg) {
                        debug('etl done, notifying client to proceed');
                        debug('msg', msg);
                        res.send({ success: true, datasetName: msg.name });
                        debug('notified');
                    }, fail);
        } catch (err) {
            fail(err);
        }
    });
}

module.exports = {
    post: post
}

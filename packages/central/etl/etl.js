var vgraph   = require('./vgraph.js');
var vgwriter = require('../node_modules/graph-viz/js/libs/VGraphWriter.js');
var debug    = require('debug')('graphistry:etl:etl');

function etl(msg, res) {
    debug('ETL for', msg.name);
    var vg = vgraph.fromEdgeList(msg.data);
    //debug('VG', vg);

    var metadata = {
        name: msg.name,
        type: 'vgraph',
        config: {
            simControls: 'netflow',
            scene: 'netflow',
            mapper: 'debugMapper'
        }
    };


    res.send(metadata.name);
    vgwriter.uploadVGraph(vg, metadata).then(function () {
        // TODO FIXME
        debug('Replying', metadata.name);
        res.send(metadata.name);
    }).fail(function (err) {
        res.send(err);
    });
}

function post(req, res) {
    var data = "";

    req.on('data', function (chunk) {
        data += chunk;
    });

    req.on('end', function () {
        etl(JSON.parse(data), res);
    });
}

module.exports = {
    post: post
}

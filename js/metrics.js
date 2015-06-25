'use strict';


var Rx = require("rx");
var request = require('request');
var config = require('config')();
var _ = require('underscore');
var dns = require('dns');

var Log         = require('common/logger.js');
var logger      = Log.createLogger('metrics');
logger.fields.name = 'boundary';


logger.info('FIXME reject expired certs (currently relaxing for Boundary)');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


var IS_ONLINE = false;
dns.resolve('www.graphistry.com', function (err) {
    if (!err) {
        IS_ONLINE = true;
    }
});

function sendToBoundary (entry) {
    if (!config.BOUNDARY || (config.ENVIRONMENT === 'local' /*&& !IS_ONLINE*/)) {
        logger.debug(entry);
        return;
    }

    var property = _.keys(entry)[0];
    var data = {
        measure: entry[property],
        metric: property.toUpperCase(),
        timestamp: Date.now() / 1000,
        source: config.HOSTNAME
    };

    request.post(
        {
            url: config.BOUNDARY.ENDPOINT,
            auth: config.BOUNDARY.AUTH,
            headers: {
                'Content-Type': 'application/json'
            },
            json: true,
            body: data,
        },
        function (error, response, body) {
            if (error) {
                logger.error(error, 'Error posting to boundary');
            } else {
                if (response.statusCode !== 200) {
                    logger.error(response, 'Boundary returned error');
                }
            }
        });

};


// Send logged metrics to Boundary
// { '0': { 'method': 'tick', durationMS': 173 } }
var info = function () {
    for (var key in arguments) {
        if (arguments.hasOwnProperty(key)) {
            var entry = arguments[key];

            // If the metric and value keys exist, send it along to Boundary /
            // Graphite / whatever
            if (entry['metric']) {
                sendToBoundary(entry['metric']);
            }
        }
    }
};


// Must call init first with a namespace
var init = function(name){
    // noop since we took out Bunyan logging. Remains for compatability reasons.
}

/* Boundary floods log with error, disabling
module.exports = {
    'info': info,
    'init': init
};
*/

module.exports = {
    'info': function () {},
    'init': function () {}
};

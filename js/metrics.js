"use strict";


var Rx = require("rx");
var request = require('request');
var config = require('config')();
var debug = require('debug')('boundary:metrics');
var _ = require('underscore');
var dns = require('dns');


console.error('FIXME reject expired certs (currently relaxing for Boundary)');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


var IS_ONLINE = false;
require('dns').resolve('www.graphistry.com', function (err) {
    if (!err) {
        IS_ONLINE = true;
    }
});

function sendToBoundary (entry) {

    if (!config.BOUNDARY || (config.ENVIRONMENT === 'local' && !IS_ONLINE)) {
        debug(entry);
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
                console.error('Error posting to boundary', error.body);
            } else {
                if (response.statusCode !== 200) {
                    console.error('Boundary returned error', response.body);
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

module.exports = {
    "info": info,
    "init": init
};

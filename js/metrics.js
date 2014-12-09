"use strict";


var Rx = require("rx");
var request = require('request');
var config = require('config')();


// TODO: Import via config file, this should be in Ansible
var boundaryUrl = 'https://abe@graphistry.com:api.fc39b94e8f-3713@premium-api.boundary.com/v1/measurements';


var sendToBoundary = function(entry) {
    if(config.ENVIRONMENT === 'local') {
        return;
    }

    var data = {}
    for ( var property in entry ) {
        data['measure'] = entry[property];
        data['metric'] = property.toUpperCase();
    }
    data['timestamp'] = Date.now() / 1000;
    data['source'] = config.HOSTNAME;
    request({
        headers: {
            'Content-Type': 'application/json'
        },
        uri: boundaryUrl,
        body: JSON.stringify(data),
        method: 'POST',
        },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                return;
            } else {
                console.log('boundary API error', body)
            }
        }
    );
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

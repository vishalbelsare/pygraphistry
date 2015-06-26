'use strict';
//Essentially, data here should be collected then piped into outside sources, such as boundary, and then have that service process/display the data

var request = require('request');
var config = require('config')();
var _ = require('underscore');
var Log         = require('./logger.js');
var logger      = Log.createLogger('perfStats');

// Timing: sends a timing command with the specified milliseconds
function timing() {
  return;
}
// client.timing('response_time', 42);

var timestamps = {};
function startTiming(id) {
    timestamps[id] = id;
}

function endTiming(id) {
    if(!timestamps[id]) {
        //What should I do if id is not found?
        return;
    }
    timing(id, Date.now() - timestamps[id]);
}

// Increment: Increments a stat by a value (default is 1)
function increment() {
  return;
}
// client.increment('my_counter');

// Decrement: Decrements a stat by a value (default is -1)
function decrement() {
  return;
}
// client.decrement('my_counter');

// Histogram: send data for histogram stat
function histogram() {
  return;
}
// client.histogram('my_histogram', 42);

// Gauge: Gauge a stat by a specified amount
function gauge() {
  return;
}
// client.gauge('my_gauge', 123.45);

// Set: Counts unique occurrences of a stat (alias of unique)
function set() {
  return;
}

function unique() {
  return;
}
// client.set('my_unique', 'foobar');
// client.unique('my_unique', 'foobarbaz');

// Is it necessary to store metrics locally, or should everything just be sent to boundary?
var metrics = {};

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
}

// Send logged metrics to Boundary
// { '0': { 'method': 'tick', durationMS': 173 } }
var getMetric = function () {
    for (var key in arguments) {
        if (!arguments.hasOwnProperty(key)) continue;

        // If the metric and value keys exist, send it along to Boundary /
        // Graphite / whatever
        if (arguments[key]['metric']) {
            var entry = arguments[key]['metric'];
            var property = _.keys(entry)[0];
            if(!metrics[property]) {
                metrics[property] = [];
            }
            else {
                metrics[property].push({
                    metric: entry[property],
                    timestamp: Date.now() / 1000,
                    source: config.HOSTNAME
                });
            }
            sendToBoundary(entry);
        }
    }
};

function createPerfMonitor() {
  return {
    startTiming: startTiming,
    endTiming: endTiming,
    timing: timing,
    increment: increment,
    decrement: decrement,
    histogram: histogram,
    gauge: gauge,
    set: set,
    unique: unique,
    createPerfMonitor: createPerfMonitor,
    getMetric: getMetric,
    metrics: metrics
  };
}

module.exports = {
  createPerfMonitor: createPerfMonitor
};

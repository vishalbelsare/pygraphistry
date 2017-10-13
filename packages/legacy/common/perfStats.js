'use strict';
//Essentially, data here should be collected then piped into outside sources, such as boundary, and then have that service process/display the data

var config = require('@graphistry/config')();
var _ = require('underscore');
var Log = require('./logger.js');
var logger = Log.createLogger('perfStats');

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
    if (!timestamps[id]) {
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
        createPerfMonitor: createPerfMonitor
    };
}

module.exports = {
    createPerfMonitor: createPerfMonitor
};

'use strict';

var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var _       = require('underscore');
var moment  = require('moment-timezone');
var sprintf = require('sprintf-js').sprintf;
var debug   = require('debug')('graphistry:StreamGL:graphVizApp:contentFormatter');
var d3      = require('d3');

var util    = require('./util.js');

// TODO: Wrap this up into a formatter object instead of a global here.
// Initialize with moment's best guess at timezone.
var displayTimezone = moment.tz.guess();
function setTimeZone (newTimezone) {
    // Treat empty string as reset (because this comes from a text input)
    if (newTimezone === '') {
        displayTimezone = moment.tz.guess();
        return;
    }

    var zoneObj = moment.tz.zone(newTimezone);
    if (zoneObj) {
        debug('Setting timezone from '+ displayTimezone + ' to: ' + newTimezone);
        displayTimezone = newTimezone;
    } else {
        debug('Attempted to set timezone to invalid value: ' + newTimezone);
    }
}

function castToMoment (value) {
    var momentVal;
    if (typeof(value) === 'number') {
        // First attempt unix seconds constructor
        momentVal = moment.unix(value);

        // If not valid, or unreasonable year, try milliseconds constructor
        if (!momentVal.isValid() || momentVal.year() > 5000) {
            momentVal = moment(value);
        }

    } else {
        momentVal = moment(value);
    }

    return momentVal;
}

function defaultFormat (value, dataType) {

    // null guards
    if (dataType === 'number' && (isNaN(value) || value === 0x7FFFFFFF)) {
        return null;
    }
    if (dataType === 'string' && (value === 'n/a' || value === '\0')) {
        return null;
    }


    if (dataType === 'date') {
        var momentVal = castToMoment(value);

        if (!momentVal.isValid()) {
            return 'Invalid Date';
        }

        // If user has specified a timezone, use that to format the time.
        if (displayTimezone) {
            momentVal.tz(displayTimezone);
        }

        return momentVal.format('MMM D YYYY, h:mm:ss a z');
    }

    if (dataType === 'number') {
        if (value && (value % 1 !== 0)) {
            return sprintf('%.4f', value);
        }
    }

    return String(value); // Default
}

function d3ColorFromRGBA(x) {
    var r = (x >> 16) & 255,
        g = (x >> 8) & 255,
        b = x & 255;
    return d3.rgb(r, g, b);
}


function decodeColumnValue (val, attributeName) {
    if (!isNaN(val)) {
        val = Number(val); // Cast to number in case it's a string

        if (attributeName.match(/color/i)) {
            return d3ColorFromRGBA(val);
        }

        if (attributeName.indexOf('Date') > -1) {
            return new Date(val);
        }
    }
    return val;
}

function maybePrecise(v) {
    var diff = Math.abs(v - Math.round(v));
    if (diff > 0.1) {
        return v.toFixed(1);
    } else {
        return v;
    }
}

function shortFormat (value, dataType, attributeName) {

    if (dataType === 'date') {
        var momentVal = castToMoment(value);

        if (!momentVal.isValid()) {
            return 'Invalid Date';
        }

        // If user has specified a timezone, use that to format the time.
        if (displayTimezone) {
            momentVal.tz(displayTimezone);
        }

        return momentVal.format('MMM D YY, h:mm:ss a');
    }


    if (!isNaN(value)) {
        value = decodeColumnValue(value, attributeName);

        if (value instanceof d3.color) {
            return d.toString();
        }

        if (value instanceof Date) {
            return d3.time.format('%m/%d/%Y')(d);
        }

        var abs = Math.abs(value);
        var precision = 4;
        if (abs > 1000000000000 || (value !== 0 && Math.abs(value) < 0.00001)) {
            return String(value.toExponential(precision));
        } else if (abs > 1000000000) {
            return String( maybePrecise(value/1000000000) ) + 'B';
        } else if (abs > 1000000) {
            return String( maybePrecise(value/1000000) ) + 'M';
        } else if (abs > 1000) {
            return String( maybePrecise(value/1000) ) + 'K';
        } else {
            value = Math.round(value*1000000) / 1000000; // Kill rounding errors
            return String(value);
        }

    } else {
        var str = String(value);
        var limit = 10;
        if (str.length > limit) {
            return str.substr(0, limit-1) + '…';
        } else {
            return str;
        }
    }

}



module.exports = {
    defaultFormat: defaultFormat,
    setTimeZone: setTimeZone,
    shortFormat: shortFormat
};

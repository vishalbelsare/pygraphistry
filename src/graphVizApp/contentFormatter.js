'use strict';

var moment  = require('moment-timezone');
var sprintf = require('sprintf-js').sprintf;
var debug   = require('debug')('graphistry:StreamGL:graphVizApp:contentFormatter');
var d3      = require('d3');

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

    if (dataType === 'color') {
        if (!isNaN(value)) {
            value = d3ColorFromRGBA(value);
            return value.toString();
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

/**
 * Calculate significant figures on this as a radix.
 * @param {Number} v
 * @param {Number} significantFigures
 * @returns {String}
 */
function maybePrecise(v, significantFigures) {
    if (v === Math.floor(v)) {
        return v.toString();
    }
    var remainder = Math.abs(v), precision = significantFigures;
    while (remainder > 1 && precision > 0) {
        remainder /= 10;
        precision--;
    }
    // Cut out trailing zeroes beyond the decimal point:
    var printed = v.toFixed(precision), printedOneLessDigit = v.toFixed(precision - 1);
    while (precision > 1 && Number(printedOneLessDigit) === Number(printed)) {
        printed = printedOneLessDigit;
        precision--;
        printedOneLessDigit = v.toFixed(precision - 1);
    }
    return printed;
}

function shortFormat (value, dataType) {

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

    if (dataType === 'color') {
        if (!isNaN(value)) {
            value = d3ColorFromRGBA(value);
            return value.toString();
        }
    }

    if (isNaN(value)) {
        var str = String(value);
        var limit = 10;
        if (str.length > limit) {
            return str.substr(0, limit - 1) + '…';
        } else {
            return str;
        }
    } else {
        var abs = Math.abs(value);
        var precision = 4;
        if (abs > 1e12 || (value !== 0 && abs < 1e-5)) {
            return String(value.toExponential(precision));
        } else if (abs > 1e9) {
            return maybePrecise(value / 1e9, precision) + 'B';
        } else if (abs > 1e6) {
            return maybePrecise(value / 1e6, precision) + 'M';
        } else if (abs > 1e3) {
            return maybePrecise(value / 1e3, precision) + 'K';
        } else {
            value = Math.round(value * 1e6) / 1e6; // Kill rounding errors
            return String(value);
        }
    }
}



module.exports = {
    defaultFormat: defaultFormat,
    setTimeZone: setTimeZone,
    shortFormat: shortFormat
};

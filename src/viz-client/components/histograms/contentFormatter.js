'use strict';

const moment  = require('moment-timezone');
const sprintf = require('sprintf-js').sprintf;
const d3Color      = require('d3-color');

// TODO: Wrap this up into a formatter object instead of a global here.
// Initialize with moment's best guess at timezone.
let displayTimezone = moment.tz.guess();
function setTimeZone (newTimezone) {
    // Treat empty string as reset (because this comes from a text input)
    if (newTimezone === '') {
        displayTimezone = moment.tz.guess();
        return;
    }

    const zoneObj = moment.tz.zone(newTimezone);
    if (zoneObj) {
        debug('Setting timezone from '+ displayTimezone + ' to: ' + newTimezone);
        displayTimezone = newTimezone;
    } else {
        debug('Attempted to set timezone to invalid value: ' + newTimezone);
    }
}

function castToMoment (value) {
    let momentVal;
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


function formatDate (value, short = false) {
    const momentVal = castToMoment(value);

    if (!momentVal.isValid()) {
        return 'Invalid Date';
    }

    // If user has specified a timezone, use that to format the time.
    if (displayTimezone) {
        momentVal.tz(displayTimezone);
    }

    return momentVal.format(short ? 'MMM D YY, h:mm:ss a' : 'MMM D YYYY, h:mm:ss a z');
}


function formatToString (value, short = false, limit = 10) {
    const str = String(value);
    if (short === false) {
        return str;
    } else if (str.length > limit) {
        return str.substr(0, limit - 1) + '…';
    } else {
        return str;
    }
}


/**
 * Calculate significant figures on this as a radix.
 * @param {Number} v
 * @param {Number} significantFigures
 * @returns {String}
 */
function maybePrecise (v, significantFigures) {
    if (v === Math.floor(v)) {
        return v.toString();
    }
    let remainder = Math.abs(v), precision = significantFigures;
    while (remainder > 1 && precision > 0) {
        remainder /= 10;
        precision--;
    }
    // Cut out trailing zeroes beyond the decimal point:
    let printed = v.toFixed(precision), printedOneLessDigit = v.toFixed(precision - 1);
    while (precision > 1 && Number(printedOneLessDigit) === Number(printed)) {
        printed = printedOneLessDigit;
        precision--;
        printedOneLessDigit = v.toFixed(precision - 1);
    }
    return printed;
}


function formatNumber (value, short = false, precision = 4) {
    if (!short) {
        return sprintf('%.4f', value);
    }
    const abs = Math.abs(value);
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

function d3ColorFromRGBA (x) {
    const r = (x >> 16) & 255,
        g = (x >> 8) & 255,
        b = x & 255;
    return d3Color.rgb(r, g, b);
}

function formatColor (value) {
    value = d3ColorFromRGBA(value);
    return value.toString();
}

function formatBoolean (value) {
    if (value === true) {
        return '✓';
    } else if (value === false) {
        return '✗';
    } else {
        return '☐';
    }
}


function defaultFormat (value, dataType = typeof value) {
    // null guards
    if (value === undefined) {
        return null;
    }
    if (dataType === 'number' && (isNaN(value) || value === 0x7FFFFFFF)) {
        return null;
    }
    if (dataType === 'string' && (value === 'n/a' || value === '\0')) {
        return null;
    }

    if (dataType === 'boolean') {
        return formatBoolean(value);
    }

    if (dataType === 'date') {
        return formatDate(value, false);
    }

    if (dataType === 'number') {
        if (value && (value % 1 !== 0)) {
            return formatNumber(value, false);
        }
    }

    if (dataType === 'color') {
        if (!isNaN(value)) {
            return formatColor(value);
        }
    }

    return formatToString(value, false); // Default
}


function shortFormat (value, dataType = typeof value) {
    // null guards
    if (value === undefined) {
        return null;
    }
    if (dataType === 'number' && (isNaN(value) || value === 0x7FFFFFFF)) {
        return null;
    }
    if (dataType === 'string' && (value === 'n/a' || value === '\0')) {
        return null;
    }

    if (dataType === 'boolean') {
        return formatBoolean(value);
    }

    if (dataType === 'date') {
        return formatDate(value, true);
    }

    if (dataType === 'color') {
        if (!isNaN(value)) {
            value = formatColor(value);
        }
    }

    if (isNaN(value)) {
        return formatToString(value, true);
    }

    return formatNumber(value, true);
}



module.exports = {
    defaultFormat: defaultFormat,
    setTimeZone: setTimeZone,
    shortFormat: shortFormat
};

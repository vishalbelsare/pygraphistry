'use strict';

var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var _       = require('underscore');
var moment  = require('moment-timezone');
var sprintf = require('sprintf-js').sprintf;
var debug   = require('debug')('graphistry:StreamGL:graphVizApp:contentFormatter');

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

function defaultFormat (value, dataType) {

    // null guards
    if (dataType === 'number' && (isNaN(value) || value === 0x7FFFFFFF)) {
        return null;
    }
    if (dataType === 'string' && (value === 'n/a' || value === '\0')) {
        return null;
    }


    if (dataType === 'date') {
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

function shortFormat (value, dateType) {

}



module.exports = {
    defaultFormat: defaultFormat,
    setTimeZone: setTimeZone
};

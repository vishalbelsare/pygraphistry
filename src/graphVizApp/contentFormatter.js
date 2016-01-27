'use strict';

var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var _       = require('underscore');
var moment  = require('moment');
var sprintf = require('sprintf-js').sprintf;

var util    = require('./util.js');


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

        return momentVal.format('MMM D YYYY, h:mm:ss a Z');
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
    defaultFormat: defaultFormat
};

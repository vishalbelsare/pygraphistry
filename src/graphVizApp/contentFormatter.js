'use strict';

var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util    = require('./util.js');


function defaultFormat (value, dataType) {

    if (dataType === 'date') {
        var dateObj = new Date(value);
        return String(dateObj);
    }

    return String(value); // Default
}

function shortFormat (value, dateType) {

}


function prettyPrint (d, attributeName, noLimit) {
    if (!isNaN(d)) {
        d = decodeColumnValue(d, attributeName);

        if (d instanceof d3.color) {
            return d.toString();
        }

        if (d instanceof Date) {
            return d3.time.format('%m/%d/%Y')(d);
        }

        var abs = Math.abs(d);
        var precision = 4;
        if (abs > 1000000000000 || (d !== 0 && Math.abs(d) < 0.00001)) {
            return String(d.toExponential(precision));
        } else if (abs > 1000000000) {
            return String( maybePrecise(d/1000000000) ) + 'B';
        } else if (abs > 1000000) {
            return String( maybePrecise(d/1000000) ) + 'M';
        } else if (abs > 1000) {
            return String( maybePrecise(d/1000) ) + 'K';
        } else {
            d = Math.round(d*1000000) / 1000000; // Kill rounding errors
            return String(d);
        }

    } else {
        var str = String(d);
        var limit = 10;
        if (str.length > limit && !noLimit) {
            return str.substr(0, limit-1) + '…';
        } else {
            return str;
        }
    }
}











module.exports = {
    defaultFormat: defaultFormat
};

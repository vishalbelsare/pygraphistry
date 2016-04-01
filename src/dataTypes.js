'use strict';

// TODO customize based on user/content preferences:
var DefaultLocale = 'en-US';
// TODO customize based on user/content preferences, and/or per column.
var LocaleCompareOptions = {usage: 'sort', numeric: true};

var SupportedDataTypes = [
    'number',
    'integer',
    'string',
    'array',
    'date',
    'datetime',
    /*'money',*/
    'object'
];

var DataTypesUtils = {
    numberSignifiesUndefined: function (value) {
        return isNaN(value);
    },

    int32SignifiesUndefined: function (value) {
        return value === 0x7FFFFFFF;
    },

    dateSignifiesUndefined: function (value) {
        var dateObj = new Date(value);
        return isNaN(dateObj.getTime());
    },

    stringSignifiesUndefined: function (value) {
        // TODO retire 'n/a'
        return value === '\0' || value === 'n/a';
    },

    valueSignifiesUndefined: function (value) {
        switch (typeof value) {
            case 'undefined':
                return true;
            case 'string':
                return this.stringSignifiesUndefined(value);
            case 'number':
                return this.numberSignifiesUndefined(value) || this.int32SignifiesUndefined(value);
            case 'date':
            case 'datetime':
                return this.dateSignifiesUndefined(value);
            case 'object':
            case 'array':
                return false;
            default:
                return false;
        }
    },

    keyMakerForDataType: function (dataType) {
        switch (dataType) {
            case 'undefined':
            case 'number':
            case 'integer':
                return function (value) { return value.toString(); };
            case 'string':
                return function (value) { return value; };
            case 'date':
                return function (value) { return value.toDateString(); };
            case 'datetime':
                return function (value) { return value.toISOString(); };
            case 'object':
            case 'array':
                return function (value) { return value === null ? value.toString() : JSON.stringify(value); };
            default:
                return function (value) { return value.toString(); };
        }
    },

    isLessThanForDataType: function (dataType) {
        switch (dataType) {
            case 'string':
                return function (a, b) { return a.localeCompare(b, DefaultLocale, LocaleCompareOptions) < 0; };
            default:
                return function (a, b) { return a < b; };
        }
    }
};

module.exports = DataTypesUtils;

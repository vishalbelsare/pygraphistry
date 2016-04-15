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
                return (value) => value.toString();
            case 'string':
                return (value) => value;
            case 'date':
                return (value) => value.toDateString();
            case 'datetime':
                return (value) => value.toISOString();
            case 'object':
                return (value) => value === null ? value.toString() : JSON.stringify(value);
            case 'array':
                return (value) => JSON.stringify(value);
            default:
                return (value) => value.toString();
        }
    },

    isLessThanForDataType: function (dataType) {
        switch (dataType) {
            case 'string':
                return (a, b) => a.localeCompare(b, DefaultLocale, LocaleCompareOptions) === -1;
            default:
                return (a, b) => a < b;
        }
    }
};

module.exports = DataTypesUtils;

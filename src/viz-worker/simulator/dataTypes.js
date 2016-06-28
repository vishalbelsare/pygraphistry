'use strict';

const _ = require('underscore');

// TODO customize based on user/content preferences:
const DefaultLocale = 'en-US';
// TODO customize based on user/content preferences, and/or per column.
const LocaleCompareOptions = {usage: 'sort', numeric: true};

const SupportedDataTypes = [
    'number',
    'integer',
    'string',
    'array',
    'date',
    'datetime',
    /*'money',*/
    'object'
];

const DataTypesUtils = {
    numberSignifiesUndefined: function (value) {
        return isNaN(value);
    },

    int32SignifiesUndefined: function (value) {
        return value === 0x7FFFFFFF;
    },

    dateSignifiesUndefined: function (value) {
        const dateObj = new Date(value);
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

    isCompatible: function (dataType, value) {
        switch (dataType) {
            case 'undefined':
                return value === undefined;
            case 'number':
                return _.isNumber(value);
            case 'integer':
                return _.isNumber(value) && parseInt(value) === value;
            case 'string':
                return _.isString(value);
            case 'date':
            case 'datetime':
                return _.isDate(value);
            case 'object':
                return _.isObject(value);
            case 'array':
                return _.isArray(value);
            default:
                return true;
        }
    },

    isLessThanForDataType: function (dataType) {
        switch (dataType) {
            case 'string':
                return (a, b) => a.localeCompare(b, DefaultLocale, LocaleCompareOptions) === -1;
            default:
                return (a, b) => a < b;
        }
    },

    comparatorForDataType: function (dataType) {
        switch (dataType) {
            case 'number':
            case 'integer':
                return (a, b) => a - b;
            case 'string':
                return (a, b) => a.localeCompare(b, DefaultLocale, LocaleCompareOptions);
            case 'date':
            case 'datetime':
                return (a, b) => a.getTime() - b.getTime();
            default:
                return undefined;
        }
    },

    roundUpBy: function roundUpBy(num, multiple = 0) {
        if (multiple === 0) {
            return num;
        }

        const div = num / multiple;
        return multiple * Math.ceil(div);
    },

    roundDownBy: function roundDownBy(num, multiple = 0) {
        if (multiple === 0) {
            return num;
        }

        const div = num / multiple;
        return multiple * Math.floor(div);
    },

    dateIncrementors: function (timeAggLevel) {
        // TODO: Rest of time ranges
        switch (timeAggLevel) {
            case 'day':
                return {
                    inc: (date) => date.setHours(24,0,0,0),
                    dec: (date) => date.setHours(0,0,0,0)
                };
            case 'hour':
                return {
                    inc: (date) => date.setMinutes(60,0,0),
                    dec: (date) => date.setMinutes(0,0,0)
                };
            case 'minute':
                return {
                    inc: (date) => date.setSeconds(60,0),
                    dec: (date) => date.setSeconds(0,0)
                };
            case 'second':
                return {
                    inc: (date) => date.setMilliseconds(1000),
                    dec: (date) => date.setMilliseconds(0)
                };
        }
        return undefined;
    }
};

module.exports = DataTypesUtils;

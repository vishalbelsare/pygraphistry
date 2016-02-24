'use strict';

// TODO customize based on user/content preferences:
var DefaultLocale = 'en-US';
// TODO customize based on user/content preferences, and/or per column.
var LocaleCompareOptions = {usage: 'sort', numeric: true};

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
                return this.dateSignifiesUndefined(value);
            case 'object':
                return value === null;
            default:
                return false;
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

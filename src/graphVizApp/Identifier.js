'use strict';

module.exports = {
    /**
     * @param {String} attributeName
     * @param {String} prefixSegment
     * @returns {String}
     */
    clarifyWithPrefixSegment: function (attributeName, prefixSegment) {
        // Basic namespace-indication:
        if (prefixSegment === undefined) {
            return attributeName;
        }
        var prefix = prefixSegment + ':';
        if (attributeName.indexOf(prefix) === 0) {
            return attributeName;
        }
        return prefix + attributeName;
    },

    /**
     * @param {String} attributeName
     * @returns {String}
     */
    identifierToExpression: function (attributeName) {
        if (attributeName.match(/[^A-Za-z0-9:_]/)) {
            return '[' + attributeName.replace(']', '\\]') + ']';
        } else {
            return attributeName;
        }
    },

    /**
     * @param {String} attributeName
     * @returns {ColumnName}
     */
    identifierToColumnName: function (attributeName) {
        if (attributeName.match(/^[a-z]+:/)) {
            const [type, attribute] = attributeName.split(':', 2);
            return {type: type, attribute: attribute};
        } else {
            return {attribute: attributeName};
        }
    },

    isPrivate: function (attributeName) {
        return attributeName[0] === '_';
    }
};

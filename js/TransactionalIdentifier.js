'use strict';

var simpleflake = require('simpleflake');

// January 1, 2015
simpleflake.options.epoch = Date.UTC(2015, 0, 1);
var format = 'base58';

/**
 * This defines a simple, distribution-safe identifier and wraps it into a convention for reading and writing.
 * @param id - optional identifier to provide.
 * @constructor
 */
function TransactionalIdentifier(id) {
    this.id = id === undefined ? simpleflake() : id;
}

/**
 * Serializes the identifier to a string for e.g. JSON and hash keys.
 * @returns {String}
 */
TransactionalIdentifier.prototype.toString = function () {
    return this.id.toString(format);
};

/**
 * Read the identifier from a serialized string.
 * @param inputString base58-encoded number.
 * @returns {TransactionalIdentifier}
 */
TransactionalIdentifier.fromString = function (inputString) {
    return new TransactionalIdentifier(simpleflake.parse(inputString, format));
};

module.exports = TransactionalIdentifier;

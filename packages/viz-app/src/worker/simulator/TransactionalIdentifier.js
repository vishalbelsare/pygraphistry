'use strict';

import { simpleflake, parseSimpleflake } from 'simpleflakes';

// January 1, 2015
const epoch = Date.UTC(2015, 0, 1);
// var format = 'base58';

/**
 * This defines a simple, distribution-safe identifier and wraps it into a convention for reading and writing.
 * @param id - optional identifier to provide.
 * @constructor
 */
function TransactionalIdentifier(struct = { timestamp: 0, randomBits: 0 }) {
    this.id = simpleflake(struct.timestamp, struct.randomBits, epoch);
}

/**
 * Serializes the identifier to a string for e.g. JSON and hash keys.
 * @returns {String}
 */
TransactionalIdentifier.prototype.toString = function () {
    return this.id.toJSON();
};

/**
 * Read the identifier from a serialized string.
 * @param inputString base58-encoded number.
 * @returns {TransactionalIdentifier}
 */
TransactionalIdentifier.fromString = function (inputString) {
    return new TransactionalIdentifier(parseSimpleflake(inputString));
};

export default TransactionalIdentifier;

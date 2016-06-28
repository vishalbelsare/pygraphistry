'use strict';

/* Utility functions for monkey patching.
 * See http://me.dt.in.th/page/JavaScript-override/
 */
function patch(object, methodName, callback) {
    object[methodName] = callback(object[methodName]);
}

function after(extraBehavior) {
    return function(original) {
        return function() {
            var returnValue = original.apply(this, arguments);
            extraBehavior.apply(this, arguments);
            return returnValue;
        };
    };
}

function before(extraBehavior) {
    return function(original) {
        return function() {
            extraBehavior.apply(this, arguments);
            return original.apply(this, arguments);
        };
    };
}

function compose(extraBehavior) {
    return function(original) {
        return function() {
            return extraBehavior.call(this, original.apply(this, arguments));
        };
    };
}

module.exports = {
    patch: patch,
    after: after,
    before: before,
    compose: compose
};

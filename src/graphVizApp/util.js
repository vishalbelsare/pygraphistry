'use strict';

function makeErrorHandler(name) {
    return function (err) {
        console.error(name, err, (err || {}).stack);
    };
}

module.exports = {
    makeErrorHandler: makeErrorHandler
};

"use strict";

var $ = require("jquery");


exports.error = function(message) {
    console.error(message, ". Stack:\n", new Error().stack);

    var $msg = $("<span>")
        .addClass("status-error")
        .text(message);

    $(".status-bar")
        .append($msg)
        .css("visibility", "visible");
};


/**
 * Returns an Object representing each of the window URL's query paramters.
 * @example the url "index.html?foo=bar&baz" returns {"foo": "bar", "baz": true}
 */
exports.getQueryParams = function() {
    var query = window.location.search.substring(1);

    var spaces = /\+/g;
    var qParts = /([^&=]+)(=([^&]*))?/;

    return query.split("&").reduce(function(res, param) {
        if(param === "") { return res; }

        var parts = qParts.exec(param);
        var key = parts[1].replace(spaces, " ");
        var value = (typeof parts[3] === "undefined" ? "" : parts[3]).replace(spaces, " ");

        res[key] = value;
        return res;
    }, {});
};

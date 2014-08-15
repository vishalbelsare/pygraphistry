"use strict";

try {
    if (typeof($) == "undefined") {
        $ = require("jquery");
    }
} catch (e) {
    //do not need jquery
}


exports.error = function(message) {
    console.error(message, new Error().stack);

    if (typeof($) != "undefined") {
        var $msg = $("<span>")
            .addClass("status-error")
            .text(message);

        $(".status-bar")
            .append($msg)
            .css("visibility", "visible");
    }
};
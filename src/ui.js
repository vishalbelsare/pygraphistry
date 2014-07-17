"use strict";

var $ = require("jquery");


exports.error = function(message) {
    console.error(message);

    var $msg = $("<span>")
        .addClass("status-error")
        .text(message);

    $(".status-bar")
        .append($msg)
        .css("visibility", "visible");
};
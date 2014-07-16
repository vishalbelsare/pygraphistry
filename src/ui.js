"use strict";

var $ = require("jquery");


exports.error = function(message) {
    console.error(message);

    var msgEl = $("<span>")
        .addClass("status-error")
        .text(message);

    $(".status-bar")
        .append(msgEl)
        .css("visibility", "visible");
};
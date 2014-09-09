"use strict";

var $               = require("jquery"),
    debug           = require("debug")("StreamGL:main:sc");

var streamClient    = require('./main.js'),
    ui              = require('./ui.js'),
    interaction     = require("./interaction.js");



/*
Enable debuging output in the console by running:
    localStorage.debug = "StreamGL:*";
in the console. Disable debug output by running:
    localStorage.removeItem('debug');
*/

console.warn("%cWarning: having the console open can slow down execution significantly!",
    "font-size: 18pt; font-weight: bold; font-family: \"Helvetica Neue\", Helvetica, sans-serif; background-color: rgb(255, 242, 0);");

var QUERY_PARAMS = Object.freeze(ui.getQueryParams());
var DEBUG_MODE = (QUERY_PARAMS.hasOwnProperty("debug") && QUERY_PARAMS.debug !== "false" &&
        QUERY_PARAMS.debug !== "0");


var hasInit = false;

//canvas * {?camera, ?socket, ?noInteractions = false} -> {renderFrame: () -> (), setCamera: camera -> () }
function init (canvas, opts) {

    if (hasInit) return;
    hasInit = true;

    opts = opts || {};

    var client = streamClient(canvas, opts);

    if (!opts.noInteractions) {
        interaction.setupDrag($(".sim-container"), client.camera)
            .merge(interaction.setupScroll($(".sim-container"), client.camera))
            .subscribe(function(newCamera) {
                client.setCamera(newCamera);
                client.renderFrame();
            });
    }

    $("#do-disconnect").click(function(btn) {
        btn.disabled = true;
        client.disconnect();
    });

    client.socket.on("error", function(reason) {
        ui.error("Connection error (reason:", reason, (reason||{}).description, ")");
    });

    client.socket.on("disconnect", function(reason){
        $(canvas).parent().addClass("disconnected");
        ui.error("Disconnected (reason:", reason, ")");
    });

    return client;
}

window.addEventListener("load", function(){
    var meter;

    if(DEBUG_MODE) {
        $("html").addClass("debug");
        meter = new FPSMeter($("body")[0]);
    }

    init($("#simulation")[0], {meter: meter});
});


module.exports = init;
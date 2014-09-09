"use strict";

var $            = require("jquery"),
    renderConfig = require("render-config"),
    renderer     = require("./renderer.js"),
    interaction  = require("./interaction.js"),
    ui           = require("./ui.js"),
    debug        = require("debug")("StreamGL:main");


var meter;

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

function initMeter () {
    if(DEBUG_MODE) {
        $("html").addClass("debug");
        meter = new FPSMeter($("body")[0]);
    }
}

//opts :: {?meter, ?camera, ?socket}
function init (canvas, opts) {

    console.log('connected')

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (!meter) meter = {tick: function(){}, pause: function(){}};

    var socket = opts.socket;
    if (!socket) {
        socket = io.connect("http://localhost", {reconnection: false, transports: ["websocket"]});
        socket.io.engine.binaryType = "arraybuffer";
    } else if (!socket.io || !socket.io.engine || !(socket.io.engine == 'arraybuffer')) {
        console.warn('Expected binary socket');
    }

    var renderState = renderer.init(renderConfig, canvas, opts);
    var gl = renderState.get("gl");
    var programs = renderState.get("programs").toJS();
    var buffers = renderState.get("buffers").toJS();
    var camera = renderState.get("camera");

    interaction.setupDrag($(".sim-container"), camera)
        .merge(interaction.setupScroll($(".sim-container"), camera))
        .subscribe(function(newCamera) {
            renderer.setCamera(renderConfig, gl, programs, newCamera);
            renderer.render(renderConfig, gl, programs, buffers);
        });

    $("#do-disconnect").click(function(btn) {
        socket.disconnect();
        btn.disabled = true;
    });

    var lastHandshake = Date.now();

    socket.on("vbo_update", function (data, handshake) {
        console.log("VBO update");

        for (var lbl in data) {
            for (var opt in data[lbl]) {
                console.log(lbl, opt)
            }
        }
        window.data = data;


        try {
            renderer.loadBuffers(gl, buffers, data.buffers);
            renderer.setNumElements(data.elements);
            renderer.render(renderConfig, gl, programs, buffers);

            handshake(Date.now() - lastHandshake);
            lastHandshake = Date.now();
            meter.tick();
        } catch(e) {
            ui.error("Render error (", e, ")");
        }
    });


    socket.on("error", function(reason) {
        meter.pause();
        ui.error("Connection error (reason:", reason, (reason||{}).description, ")");
    });
    socket.on("disconnect", function(reason){
        meter.pause();
        $(canvas).parent().addClass("disconnected");
        ui.error("Disconnected (reason:", reason, ")");
    });

    //////

    if (!meter && typeof(window) != 'undefined') {
        window.addEventListener("load", initMeter);
    }

    return {
        renderFrame: function () {
            renderer.render(renderConfig, gl, programs, buffers);
        }
    };
}

module.exports = init;
if (typeof(window) != 'undefined') {
    window.addEventListener("load", function(){
        initMeter();
        init($("#simulation")[0], {meter: meter});
    });
}
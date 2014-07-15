"use strict";

var $        = require("jquery"),
    renderer = require("./renderer.js"),
    Cameras = require("../../../../superconductorjs/src/Camera.js");

function init(canvas) {
    var gl = renderer.init(canvas);

    // var fs = require("fs");
    // var Iconv  = require('iconv').Iconv;
    // var iconv = new Iconv('UTF-8', 'ASCII');
    // var vertShaderSource = fs.readFileSync("./src/sc_vert.shader", "utf8");
    // var fragShaderSource = fs.readFileSync("./src/sc_frag.shader", "utf8");
    // var program = renderer.loadProgram(gl, iconv.convert(vertShaderSource), iconv.convert(fragShaderSource));
    var vertexShaderSource = 'precision mediump float;\n\nattribute vec3 a_position;\nattribute vec4 a_color;\n\nuniform float u_w;\n\nuniform mat4 u_mvp_matrix;\n\nvarying vec4 v_color;\n\nvoid main() {\n    vec4 pos = vec4(a_position.x, -1.0 * a_position.y, -1.0 * a_position.z, u_w);\n    gl_Position = u_mvp_matrix * pos;\n    v_color = a_color;\n}';
    var fragmentShaderSource = "precision mediump float;\nvarying vec4 v_color;\n\nvoid main() {\n   gl_FragColor = v_color.abgr; \n}";
    var program = renderer.loadProgram(gl, vertexShaderSource, fragmentShaderSource);

    var camera = new Cameras.Camera2d({
                left: -0.15,
                right: 5,
                bottom: (5 * (1 / (700/700))) - 0.15,
                top: -0.15 - 0.15
            });
    renderer.setCamera(gl, program, camera);

    var socket = io.connect('http://localhost');
    socket.on('vbo_update', function (data) {
        console.log('got VBO update message');
        var vbo = renderer.loadBuffer(gl, data.vbo, program);

        renderer.render(gl, program);
    });
}

window.addEventListener("load", function(){
    init($("#simulation")[0]);
});
"use strict";

var debug = require('debug')('graphistry:util'),
    path = require('path'),
    fs = require('fs'),
    Q = require('q'),
    _ = require('underscore'),
    nodeutil = require('util'),
    config = require('config')();

var Image, webgl;

if (typeof(window) == 'undefined') {
    webgl = require('node-webgl');
    Image = webgl.Image;
} else {
    webgl = window.webgl;
    Image = window.Image;
}


function getShaderSource(id) {
    var shader_path = path.resolve(__dirname, '..' ,'shaders', id);
    debug('Fetching source for shader %s at path %s, using fs read', id, shader_path);
    return Q.denodeify(fs.readFile)(shader_path, {encoding: 'utf8'});
}


function getKernelSource(id) {
    var kernel_path = path.resolve(__dirname, '..' ,'kernels', id);
    debug('Fetching source for kernel %s at path %s, using fs read', id, kernel_path);
    return Q.denodeify(fs.readFile)(kernel_path, {encoding: 'utf8'});
}

/**
 * Fetch an image as an HTML Image object
 *
 * @returns a promise fulfilled with the HTML Image object, once loaded
 */
function getImage(url) {
    var deferred = Q.defer();
    try {
        var img = new Image();

        img.onload = function() {
            debug("Done loading <img>");

            deferred.resolve(img);
        };

        debug("Loading <img> from src %s", url);
        img.src = url;
        debug("  <img> src set");
    } catch (e) {
        deferred.reject(e);
    }

    return deferred.promise;
}


function die() {
    var msg = nodeutil.format.apply(this, arguments)
    console.error("FATAL ERROR: ", (new Error(msg)).stack)
    process.exit(1);
}


function makeErrorHandler() {
    var msg = nodeutil.format.apply(this, arguments);

    return function (err) {
        var content = err ? (err.stack || err) : undefined;
        if (config.ENVIRONMENT === 'local') {
            console.error('ERROR', msg, content);
        } else {
            var payload = {
                type: 'ERROR',
                pid: process.pid.toString(),
                msg: msg,
                error: content
            };
            console.error(JSON.stringify(payload));
        }
    }
}

function error(msg) {
    makeErrorHandler(msg)(new Error());
}


function rgb(r, g, b, a) {
    if (a === undefined)
        a = 255;
    // Assume little endian machines
    return (a << 24) | (b << 16) | (g << 8) | r;
}


var palettes = {
    palette1: [
        rgb(234,87,61), rgb(251,192,99), rgb(100,176,188), rgb(68,102,153),
        rgb(85,85,119)
    ],
    blue_palette: [
        rgb(247,252,240), rgb(224,243,219), rgb(204,235,197), rgb(168,221,181),
        rgb(123,204,196), rgb(78,179,211),  rgb(43,140,190),  rgb(8,104,172),
        rgb(8,64,129)
    ],
    green2red_palette: [
        rgb(0,104,55),    rgb(26,152,80),   rgb(102,189,99),
        rgb(166,217,106), rgb(217,239,139), rgb(255,255,191), rgb(254,224,139),
        rgb(253,174,97),  rgb(244,109,67),  rgb(215,48,39),   rgb(165,0,38)],
    qual_palette1: [
        rgb(141,211,199), rgb(255,255,179), rgb(190,186,218), rgb(251,128,114),
        rgb(128,177,211), rgb(253,180,98),  rgb(179,222,105), rgb(252,205,229),
        rgb(217,217,217), rgb(188,128,189), rgb(204,235,197), rgb(255,237,111)
    ],
    qual_palette2: [
        rgb(166,206,227), rgb(31,120,180), rgb(178,223,138), rgb(51,160,44),
        rgb(251,154,153), rgb(227,26,28),  rgb(253,191,111), rgb(255,127,0),
        rgb(202,178,214), rgb(106,61,154), rgb(255,255,153), rgb(177,89,40)
    ]
};

function int2color(values, palette) {
    palette = palette || palettes.palette1;

    debug("Palette: %o", palette)

    var ncolors = palette.length;
    return _.map(values, function (val) {
        return palette[val % ncolors];
    });
}

/* Check that kernel argument lists are typo-free */
function saneKernels(kernels) {
    _.each(kernels, function (kernel) {
        _.each(kernel.args, function (def, arg) {
            if (!_.contains(kernel.order, arg))
                die('In kernel %s, no order for argument %s', kernel.name, arg);
            if (!(arg in kernel.types))
                die('In kernel %s, no type for argument %s', kernel.name, arg);
        });
        _.each(kernel.order, function (arg) {
            if (!(arg in kernel.args))
                die('In kernel %s, unknown argument %s', kernel.name, arg);
        });
    });
}


// (->) * string * (->) * ... -> ()
// Run function and print timing data
// Curry to create a timed function wrapper
function perf (perf, name, fn /* args */) {
    var t0 = Date.now();
    var res = fn.apply({}, Array.prototype.slice.call(arguments, 3));
    perf(name, Date.now() - t0, 'ms');
    return res;
}


module.exports = {
    getShaderSource: getShaderSource,
    getKernelSource: getKernelSource,
    getImage: getImage,
    die: die,
    makeErrorHandler: makeErrorHandler,
    error: error,
    rgb: rgb,
    saneKernels: saneKernels,
    palettes: palettes,
    int2color: int2color,
    perf: perf
};

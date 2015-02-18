"use strict";

var debug = require("debug")("graphistry:util"),
    path = require('path'),
    fs = require('fs'),
    Q = require('q'),
    _ = require('underscore'),
    nodeutil = require('util');

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

function rgb(r, g, b, a) {
    if (a === undefined)
        a = 255;
    // Assume little endian machines
    return (a << 24) | (b << 16) | (g << 8) | r;
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

module.exports = {
    'getShaderSource': getShaderSource,
    'getKernelSource': getKernelSource,
    'getImage': getImage,
    'die': die,
    'rgb': rgb,
    'saneKernels' : saneKernels
};

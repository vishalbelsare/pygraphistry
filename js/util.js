"use strict";

var debug = require("debug")("N-body:utils");
var path = require('path');

var $ = require('jquery'),
    Q = require('q');

var Image, webgl;

if (typeof(window) == 'undefined') {
    webgl = require('node-webgl');
    Image = webgl.Image;
} else {
    webgl = window.webgl;
    Image = window.Image;
}




function getSource(id) {
    // TODO: Could we use HTML <script> elements instead of AJAX fetches? We could possibly
    // set the src of the script to our content, the type to something other than JS. Then, we
    // listen for the onload event. In this way, we may be able to load content from disk
    // without running a server.

    if (typeof window == 'undefined') {
        var fs = require('fs');
        var shader_path = path.resolve(__dirname, '..' ,'shaders', id);

        debug('Fetching shader source for shader %s at path %s, using fs read', id, shader_path)

        return Q.denodeify(fs.readFile)(shader_path, {encoding: 'utf8'});
    } else {
        var url = "shaders/" + id;

        debug('Fetching shader source for shader %s at url %s, using AJAX', id, url)

        return Q($.ajax(url, {dataType: "text"}));
    }
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

function die(msg) {
    console.error("FATAL ERROR: ", msg);
    console.error(new Error().stack);
    process.exit(1);
}

module.exports = {
    "getSource": getSource,
    "getImage": getImage,
    "die": die
};

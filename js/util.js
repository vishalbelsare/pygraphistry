define(["jQuery", "Q"], function($, Q) {
    'use strict';


    function getSource(id) {
        // TODO: Could we use HTML <script> elements instead of AJAX fetches? We could possibly
        // set the src of the script to our content, the type to something other than JS. Then, we
        // listen for the onload event. In this way, we may be able to load content from disk
        // without running a server.

        var url = "shaders/" + id;

        return Q($.ajax(url, {dataType: "text"}));
    }

    /**
     * Fetch an image as an HTML Image object
     *
     * @returns a promise fulfilled with the HTML Image object, once loaded
     */
    function getImage(url) {
        var deferred = Q.defer();
        var img = new Image();

        img.addEventListener("load", function() {
            deferred.resolve(img);
        });
        img.addEventListener("error", function(msg) {
            deferred.reject(msg);
        });

        img.src = url;

        return deferred.promise;
    }


    // Extends target by adding the attributes of one or more other objects to it
    function extend(target, object1, objectN) {
        return $.extend.apply($, arguments);
    }


    return {
        "getSource": getSource,
        "getImage": getImage,
        "extend": extend
    };
});

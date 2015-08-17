'use strict';

var $               = window.$;
var _               = require('underscore');


function liveLink(urlParams) {
    var params    = _.omit(urlParams, 'static'),
        paramStr  = _.map(params, function (v, k) { return k + '=' + v; }).join('&');
    return window.location.origin + window.location.pathname + '?' + paramStr;
}


module.exports = function (socket, urlParams) {
    var $btn = $('#goLiveButton');

    if (urlParams.static !== 'true') {
        $btn.remove();
        return;
    }

    $btn.attr('href', liveLink(urlParams));
};

'use strict';

var _ = require('underscore');

module.exports = function ($icon, urlParams) {

    if (false && window.self === window.top) {
        $icon.css({display: 'none'});
        return;
    }

    $icon.click(function () {
        var overrides = {splashAfter: Math.floor(Date.now() / 1000) + 15};
        var params    = _.extend({}, urlParams, overrides);
        var paramStr  = _.map(params, function (v, k) { return k + '=' + v; }).join('&');
        var url = window.location.origin + window.location.pathname + '?' + paramStr;
        window.open(url);
    });

};

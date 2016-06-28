'use strict';

const _ = require('underscore');

// http://stackoverflow.com/questions/326069/how-to-identify-if-a-webpage-is-being-loaded-inside-an-iframe-or-directly-into-t
function isIframe () {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

module.exports = function ($container, $icon, urlParams) {

    if (!isIframe()) {
        $container.css({display: 'none'});
        return;
    }

    $icon.click(function () {
        const overrides = {splashAfter: Math.floor(Date.now() / 1000) + 15};
        const params    = _.extend({}, urlParams, overrides);
        const paramStr  = _.map(params, function (v, k) { return k + '=' + v; }).join('&');
        const url = window.location.origin + window.location.pathname + '?' + paramStr;
        window.open(url);
    });

};

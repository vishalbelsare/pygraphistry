'use strict';

module.exports = function ($icon) {

    if (window.self === window.top) {
        $icon.css({display: 'none'});
        return;
    }

    $icon.click(function () {
        window.open(window.location.href);
    });

};
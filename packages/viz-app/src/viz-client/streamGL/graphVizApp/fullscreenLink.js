'use strict';

const _ = require('underscore');

//http://stackoverflow.com/questions/326069/how-to-identify-if-a-webpage-is-being-loaded-inside-an-iframe-or-directly-into-t
function isIframe () {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

function isFullscreen () {
    return !((document.fullScreenElement && document.fullScreenElement !== null) ||
    (!document.mozFullScreen && !document.webkitIsFullScreen));
}

// http://stackoverflow.com/questions/3900701/onclick-go-full-screen
function toggleFullscreen () {
    if (isFullscreen()) {
        if (document.cancelFullScreen) {
            document.cancelFullScreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitCancelFullScreen) {
            document.webkitCancelFullScreen();
        }
    } else {
        const documentElement = document.documentElement;
        if (documentElement.requestFullScreen) {
            documentElement.requestFullScreen();
        } else if (documentElement.mozRequestFullScreen) {
            documentElement.mozRequestFullScreen();
        } else if (documentElement.webkitRequestFullScreen) {
            documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
        }
    }
}

module.exports = function ($container, $icon, urlParams) {

    if (!isIframe()) {
        return;
    }

    $icon.click(() => {

        toggleFullscreen();

    });

};

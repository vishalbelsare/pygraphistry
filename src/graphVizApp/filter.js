'use strict';

module.exports = {
    init: function (appState, socket, urlParams, $button /*, $filteringItems */) {

        if (urlParams.debug !== 'true') {
            $button.css({display: 'none'});
        }

    }
};
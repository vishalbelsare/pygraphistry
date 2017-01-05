import React from 'react';

if (__CLIENT__) {
    module.exports = require('../../../client/GraphistryIframe.js');
} else {
    module.exports = {
        GraphistryIframe() {
            return (
                <div></div>
            );
        }
    };
}

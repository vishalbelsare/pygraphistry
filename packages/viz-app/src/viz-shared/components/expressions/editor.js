import { renderNothing } from 'recompose';

if (__CLIENT__) {
    module.exports = require('viz-client/components/expressions').Editor;
} else {
    module.exports = renderNothing();
}

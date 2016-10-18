if (__CLIENT__) {
    module.exports = require('viz-client/components/selection').Selection;
} else {
    module.exports = function SelectionComponent() {
        return (
            <div style={{
                 width: `100%`,
                 height: `100%`,
                 position: `absolute`
             }}/>
        );
    };
}

if (__CLIENT__) {
    module.exports = require('viz-client/components/renderer');
} else {
    module.exports = {
        Renderer() {
            return (
                <div style={{
                        width: `100%`,
                        height:`100%`,
                        position:`absolute`
                    }}
                />
            );
        }
    };
}

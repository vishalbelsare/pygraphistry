if (__CLIENT__) {
    module.exports = require('viz-client/components/scene').Scene;
} else {
    module.exports = function SceneComponent({ children }) {
        return (
            <div style={{ width: `100%`, height: `100%`, position: `absolute` }}>
                {children}
            </div>
        );
    };
}

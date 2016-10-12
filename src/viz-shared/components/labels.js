if (__CLIENT__) {
    module.exports = require('viz-client/components/labels').Labels;
} else {
    module.exports = function LabelsComponent() {
        return (
            <div style={{ width: `100%`, height: `100%`, position: `absolute` }}>
            </div>
        );
    };
}

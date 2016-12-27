if (__CLIENT__) {
    module.exports = require('viz-client/components/labels');
} else {
    module.exports = {
        Labels() {
            return (
                <div style={{ width: `100%`, height: `100%`, position: `absolute` }}></div>
            );
        },
        Label() {
            return (
                <div></div>
            );
        }
    };
}

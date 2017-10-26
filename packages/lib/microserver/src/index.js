const visualize = require('micro-visualize');
const microCors = require('micro-cors');
const instrumentedHandler = require('./instrumentedHandler');
const logicApplicator = require('./logicApplicator');

module.exports = ({ method, verbose = false, serviceName }) => logic => {
    const cors = microCors({ allowMethods: [method] });
    const appliedLogic = logicApplicator(logic);
    const methodScopedLogic = cors(appliedLogic);
    const instrumentedLogic = instrumentedHandler(serviceName)(methodScopedLogic);
    const visualizedLogic = visualize(instrumentedLogic, verbose ? 'dev' : '');

    return visualizedLogic;
};

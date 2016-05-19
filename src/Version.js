'use strict';

// Socket route get_version returns the server version
// Use config's ARTIFACT_TAG attribute, and if not available, graph-viz's package ver
// Assumes started via npm start

const config      = require('config')();
const log         = require('common/logger.js');
const logger      = log.createLogger('graph-viz', 'graph-viz/Version.js');


const versions = {
    artifact: config.ARTIFACT,
    release: config.RELEASE,
    build: process.env.npm_package_version // e.g., viz-server
};
logger.info(versions);


function Version (socket, socketLogger) {
    socket.on('get_version', (ignore, cb) => {
        socketLogger.info('get_version');
        cb({success: true, versions: versions});
    });
}

module.exports = Version;
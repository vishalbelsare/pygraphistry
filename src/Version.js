'use strict';

// Socket route get_version returns the server version
// Use config's ARTIFACT_TAG attribute, and if not available, graph-viz's package ver
// Assumes started via npm start

const config      = require('config')();
const log         = require('common/logger.js');
const logger      = log.createLogger('graph-viz', 'graph-viz/Version.js');


var ARTIFACT_TAG = config.ARTIFACT_TAG || process.env.npm_package_version;
logger.info({ARTIFACT_TAG: ARTIFACT_TAG, STREAMGL: require('StreamGL/dist/webpack-assets.json').StreamGL.js.replace('/dist/','')});

function Version (socket, socketLogger) {
    socket.on('get_version', (ignore, cb) => {
        socketLogger.info('get_version');
        cb({success: true, version: ARTIFACT_TAG});
    });
}

module.exports = Version;
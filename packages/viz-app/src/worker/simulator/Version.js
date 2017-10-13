'use strict';

// Print version numbers on startup & provide for other uses
//   artifact -- docker/jenkin's image id, via config (and thus docker)
//   release -- user-friendly name, via config (and thus docker)
//   build -- source code version; via viz-server package version

const config = require('@graphistry/config')();
const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/Version.js');

class Version {
    static get artifact() {
        return config.ARTIFACT;
    }

    static get build() {
        return process.env.npm_package_version;
    }

    static get release() {
        return config.RELEASE;
    }

    static get all() {
        return Object.freeze({
            artifact: Version.artifact,
            build: Version.build,
            release: Version.release
        });
    }
}

logger.info(Version.all, 'Running graph-viz @ the listed version');

export default Version;

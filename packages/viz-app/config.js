// Warning: only use Node.js natively supported JavaScript features in this file. It is imported
// and run directly into Node, without Babel complication, by the root `viz-server/index.js`.

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const convict = require('convict');
const config = require('@graphistry/config')();

// Define a schema
const conf = convict({
    env: {
        doc: 'The applicaton environment.',
        format: ['production', 'development', 'test'],
        default: 'development',
        env: 'NODE_ENV'
    },
    host: {
        doc: 'Viz-app host name/IP',
        format: 'ipaddress',
        default: config.VIZ_LISTEN_ADDRESS,
        env: 'HOST',
    },
    port: {
        doc: 'Viz-app port number',
        format: 'port',
        default: config.VIZ_LISTEN_PORT,
        arg: 'port',
        env: 'PORT'
    },
    log: {
        level: {
            doc: `Log levels - ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']`,
            format: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
            default: 'INFO',
            arg: 'log-level',
            env: 'GRAPHISTRY_LOG_LEVEL' // LOG_LEVEL conflicts with mocha
        },
        file: {
            doc: 'Log to a file intead of stdout',
            format: String,
            default: undefined,
            arg: 'log-file',
            env: 'LOG_FILE'
        },
        logSource: {
            doc: 'Logs line numbers with debug statements. Bad for Perf.',
            format: Boolean,
            default: false,
            arg: 'log-source',
            env: 'LOG_SOURCE'
        }
    },
    authentication: {
        username: {
            doc: 'The username used to access this service',
            format: String,
            default: 'admin',
            arg: 'username',
            env: 'USERNAME'
        },
        passwordHash: {
            doc: 'Bcrypt hash of the password required to access this service, or unset/empty to disable authentication (default)',
            format: String,
            default: '',
            arg: 'password-hash',
            env: 'PASSWORD_HASH'
        }
    }
});


function loadConfigFiles() {
    let configFiles = [];

    if (process.env.CONFIG_FILES) {
        // eslint-disable-next-line no-console
        console.log(`$CONFIG_FILES environment variable set to "${process.env.CONFIG_FILES}". Will use that value instead of the files in './config/*.json'`);
        configFiles = process.env.CONFIG_FILES
            .split(',')
            .map(function(configFilePath) { return configFilePath.trim() });
    } else {
        const defaultConfigPath = path.resolve('.', 'config', '*.json');
        configFiles = glob.sync(defaultConfigPath);
    }

    const validConfigFiles = configFiles.filter(function(configFilePath) {
        if(!fs.existsSync(configFilePath)) {
            console.error(`Warning: config file "${configFilePath}" does not exist, and will be omitted from config file loading.`);
            return false;
        } else {
            return true;
        }
    })

    if (validConfigFiles.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`Loading configuration from ${validConfigFiles.join(', ')}`);
        conf.loadFile(validConfigFiles);
    }

    return validConfigFiles;
}

loadConfigFiles();
conf.validate({ strict: true });

module.exports = conf;
module.exports.conf = conf;
module.exports.default = conf;

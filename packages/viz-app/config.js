// Warning: only use Node.js natively supported JavaScript features in this file. It is imported
// and run directly into Node, without Babel complication, by the root `viz-server/index.js`.

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

let configFiles = [];

if (process.env.CONFIG_FILES) {
    configFiles = process.env.CONFIG_FILES.split(',');
} else {
    const defaultConfigPath = path.resolve('.', 'config', '*.json');
    configFiles = glob.sync(defaultConfigPath);
}

if (configFiles && configFiles.length) {
    // eslint-disable-next-line no-console
    console.log(`Loading configuration from ${configFiles.join(", ")}`);
    conf.loadFile(configFiles);
}

conf.validate({ strict: true });

module.exports = conf;
module.exports.conf = conf;
module.exports.default = conf;

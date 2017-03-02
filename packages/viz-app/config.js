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
            doc: `Log levels - ['trace', 'debug', 'info', 'warn', 'error', 'fatal']`,
            format: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
            default: 'info',
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

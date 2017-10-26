const convict = require('convict');
const Path = require('path');

// Define a schema
var config = convict({
    env: {
        doc: 'The node environment',
        format: ['production', 'development', 'test'],
        default: 'development',
        env: 'NODE_ENV'
    },
    zipkin: {
        host: {
            doc: 'The host for your zipkin instance.',
            format: String,
            default: 'zipkin',
            env: 'ZIPKIN_HOST'
        },
        port: {
            doc: 'The port for your zipkin instan ce',
            format: Number,
            default: 9411,
            env: 'ZIPKIN_PORT'
        },
        path: {
            doc: 'The path to read Zipkin on your host',
            format: String,
            default: '',
            env: 'ZIPKIN_PATH'
        }
    },
    prometheus: {
        host: {
            doc: 'The host for your prometheus instance.',
            format: String,
            default: 'prometheus',
            env: 'PROMETHEUS_HOST'
        },
        port: {
            doc: 'The port for your prometheus instance.',
            format: String,
            default: 9090,
            env: 'PROMETHEUS_PORT'
        },
        path: {
            doc: 'The path to read Prometheus on your host',
            format: String,
            default: '',
            env: 'PROMETHEUS_PATH'
        }
    }
});

var env = config.get('env');

config.loadFile(Path.join(__dirname, 'config', `${env}.json`));

// Perform validation
config.validate({ allowed: 'strict' });

module.exports = config;

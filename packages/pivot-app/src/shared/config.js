var convict = require('convict');
var fs = require('fs');

// Define a schema
var conf = convict({
    env: {
        doc: 'The applicaton environment.',
        format: ['production', 'development', 'test'],
        default: 'development',
        env: 'NODE_ENV'
    },
    host: {
        doc: 'Pivot-app host name/IP',
        format: 'ipaddress',
        default: '127.0.0.1',
        env: 'IP_ADDRESS',
    },
    port: {
        doc: 'Pivot-app port number',
        format: 'port',
        default: 3000,
        arg:'port',
        env: 'PORT'
    },
    pivotApp: {
        dataDir: {
            doc: 'Directory to stores investigation files',
            form: String,
            default: 'tests/appdata',
            arg: 'pivot-data-dir'
        }
    },
    log: {
        level: {
            doc: `Log levels - ['trace', 'debug', 'info', 'warn', 'error', 'fatal']`,
            format: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
            default: 'debug',
            arg:'log-level',
            env:'LOG_LEVEL'
        },
        file: {
            doc: 'Log so a file intead of standard out',
            format: String,
            default: undefined,
            arg:'log-file',
            env:'LOG_FILE'
        },
        logSource: {
            doc: 'Logs line numbers with debug statements. Bad for Perf.',
            format: [ true, false ],
            default: false,
            arg:'log-source',
            env:'LOG_SOURCE'
        }
    },
    graphistry: {
        key: {
            doc: `Graphistry's api key`,
            format: String,
            default: '4a04279f3df44f880b3bb960fc1133efc7eefdf77d9459fc45cf9b474a3530e5e1ca9d6a06cf8304c6e16fa6fedc0d9c',
            arg:'graphistry-key',
            env: 'GRAPHISTRY_KEY'
        },
        host: {
            doc: `The location of Graphistry's Server`,
            format: String,
            default: 'https://staging.graphistry.com',
            arg:'graphistry-host',
            env:'GRAPHISTRY_HOST'
        }
    },
    splunk: {
        key: {
            doc: 'Splunk password',
            format: String,
            default: 'graphtheplanet',
            arg:'splunk-key',
            env: 'SPLUNK_KEY'
        },
        user: {
            doc: 'Splunk user name',
            format: String,
            default: 'admin',
            arg:'splunk-user',
            env: 'SPLUNK_USER'
        },
        host: {
            doc: 'The hostname of the Splunk Server',
            format: String,
            default: 'splunk.graphistry.com',
            arg:'splunk-host',
            env: 'SPLUNK_HOST'
        }
    }
});

function inBrowser() {
    return typeof (window) !== 'undefined' && window.window === window;
}

// Load environment dependent configuration
if (!inBrowser()) {
    var env = conf.get('env');
    conf.loadFile(__dirname + '/config/' + env + '.json');
    const localConfig = __dirname + '/config/local.json';
    fs.access(localConfig, fs.constants.R_OK, function(err) {
        if (!err) {
            conf.loadFile(localConfig);
        }
    });
}

// Perform validation
conf.validate({strict: true});

module.exports = conf;

/** @module config */
'use strict';

var util = require('util');
var _ = require('lodash');


var configErrors = [];


function getS3() {
    try {
        var AWS = require('aws-sdk');
        AWS.config.update({region: 'us-west-1'});

        return new AWS.S3();
    } catch(err) {
        configErrors.push(err);
        return null;
    }
}


function getErrors(clear) {
    var errors = configErrors.slice(0);

    if(clear) { configErrors = []; }

    return errors;
}


/**
 * Sane default options (assumes local dev server). All possible options MUST be set to some value
 * here (even just to null) so as to act as an authoritative reference of all possible options.
 * @return {Object} The default options object
 */
function defaults() {
    return {
        CONFIG_ERRORS: [],
        getErrors: getErrors,

        HOSTNAME: 'localhost',
        ENVIRONMENT: 'local',

        CLUSTER: util.format('%s.local', (process.env['USER'] || 'localuser')),

        // FIXME: Change this to 'VIZ_BIND_ADDRESS', to clarify this is the IP the server binds to,
        // not the IP it is reachable at. Binding to 0.0.0.0 is legal, but not a real, routable IP.
        VIZ_LISTEN_ADDRESS: '0.0.0.0',
        VIZ_LISTEN_PORT: 10000,

        // The number of seconds old a GPU ping may be before being considered stale
        GPU_PING_TIMEOUT: 60,
        // The number of seconds a worker waits for an assigned user to connect. During this time,
        // no other connections will be assigned to this worker.
        WORKER_CONNECT_TIMEOUT: 10,

        HTTP_LISTEN_ADDRESS: 'localhost',
        HTTP_LISTEN_PORT: 3000,

        BUCKET: 'graphistry.data',
        S3: getS3(),

        DATABASE: 'graphistry-local',   // legacy option name
        MONGO_SERVER: 'mongodb://localhost/graphistry-cluster',
        PINGER_ENABLED: false,

        BOUNDARY: {
            ENDPOINT: 'https://api.graphdat.com/v1/measurements',
            AUTH: {
                user: 'boundary@graphistry.com',
                pass: 'api.62fb69d814-3713'
            }
        },

        LOCAL_CACHE: true,
        LOCAL_CACHE_DIR: '/tmp/graphistry/data_cache',

        // Path to which Bunyan will write log files. `undefined` means log to stdout.
        BUNYAN_LOG: undefined,
        // Minimum level of log messages to output. Can be 10-60, where `10` mean 'trace and above',
        // and incrementing by 10 gets to debug, info, warning, error, and fatal.
        BUNYAN_LEVEL: 20,

        // If defined, etl-worker posts notification on slack
        SLACK_BOT_ETL_TOKEN: 'xoxb-7736668449-X6kR1n3omF4CoQ6VeNiXhZSc',

        // This string is prefixed to all Graphistry routes. For example, if BASE_URL is '/foo',
        // then central will append '/vizaddr' to get the route it will listen for viz server
        // address requests, '/foo/vizaddr'. This applies to both static and dynamic content.
        BASE_PATH: '',

        // Address of the Splunk web interface for the Splunk server associated with this cluster.
        // This is used by the router to reverse-proxy connections to the Splunk web interface.
        SERVICE_ADDRESSES: {
            SPLUNK: '',
            CENTRAL: ''
        },

        PROXY: {
            ENABLED: false,
            LISTEN_PORT: 9000,
            LISTEN_ADDRESS: '127.0.0.1',
            OUT_INTERFACE: undefined
        }
    };
}


/**
 * Parses command-line arguments as JSON and combines that with the existing options.
 * @return {Object} A new set of options combining existing options with command-line options
 */
function commandLine() {
    if (process.argv.length > 2) {
        try {
            return JSON.parse(process.argv[2]);
        } catch (err) {
            err.message = 'WARNING Cannot parse command line arguments, ignoring. Error: ' + err.message;
            configErrors.push(err);

            return {};
        }
    }
}


/**
 * Sets/modifies the existing options based off the current `ENVIRONMENT` option value
 * @param  {Object} options - the set of options already set via other methods
 * @return {Object} A new set of options combining existing options with ENVIRONMENT options
 */
function deployEnv(options) {
    if(_.isEmpty(options) || _.isUndefined(options.ENVIRONMENT)) {
        return {};
    }

    // Common options for 'staging' and 'production'
    var cloudOptions = {
        MONGO_SERVER: 'mongodb://graphistry:graphtheplanet@lighthouse.2.mongolayer.com:10048,lighthouse.3.mongolayer.com:10048/graphistry-cluster?replicaSet=set-545152bc461811298c009c03',

        BUNYAN_LOG: '/var/log/graphistry-json/' + process.env.SUPERVISOR_PROCESS_NAME + '.log',
        BUNYAN_LEVEL: 30,

        PINGER_ENABLED: true,

        PROXY: {
            ENABLED: true,
            LISTEN_PORT: 9000,
            LISTEN_ADDRESS: '0.0.0.0',
            OUT_INTERFACE: undefined
        }
    };

    var stagingOptions = {
        CLUSTER: 'staging',
        DATABASE: 'graphistry-staging',
    };

    var prodOptions = {
        CLUSTER: 'production',
        DATABASE: 'graphistry-prod',
    };

    switch(options.ENVIRONMENT) {
        case 'staging':
            return _.extend({}, cloudOptions, stagingOptions);
        case 'production':
            return _.extend({}, cloudOptions, prodOptions);
        default:  // 'local'
            return {};
    }
}


function extend() {
    var args = [{}];
    for(var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    function deepExtend(curVal, newVal) {
        if((_.isObject(curVal) && !(_.isFunction(curVal))) &&
           (_.isObject(newVal) && !(_.isFunction(newVal)))) {
            return extend(curVal, newVal);
        } else {
            return newVal;
        }
    }

    args.push(deepExtend);

    return _.extend.apply(this, arguments);
}


/**
 * Run each resolver function (passing in the current options) and then combine their output (with
 * later resolvers taking precedence).
 *
 * @param  {...Function} resolvers - One or more resolver functions, which take in the set of
 * current program options (as set when resolve is called) and returns the program options to set.
 *
 * @return {Object} The set of program options created by merging the options generated by all
 * resolvers.
 */
function resolve(resolvers) {
    return _.reduce(
        arguments,
        function(resolved, resolver) {
            try {
                return extend(resolved, (_.isFunction(resolver) ? resolver(resolved) : resolver));
            } catch(err) {
                configErrors.push(err);
                return resolved;
            }
        },
        {}
    );
}


/**
 * Returns an object containing the current set of resolved options for Graphistry apps.
 * @param  {Object} optionOverrides - Options which will override all other options generators.
 * @return {Object} The set of program options generated by resolving all sources of options.
 */
function getOptions(optionOverrides) {
    optionOverrides = optionOverrides || {};
    var overrides = resolve(commandLine, optionOverrides);

    var optionsResolved = resolve(defaults, overrides, deployEnv, overrides);

    return optionsResolved;
}


module.exports = (function() {
    var emptyArgKey = (Math.random()).toString();

    return _.memoize(getOptions, function() {
        return arguments.length > 0 ? JSON.stringify(arguments) : emptyArgKey;
    });
})();

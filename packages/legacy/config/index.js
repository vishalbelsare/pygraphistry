/** @module config */
'use strict';

var util = require('util');

var Log         = require('common/logger.js');
var logger      = Log.createLogger('config');

var _ = require('lodash');
var AWS = require('aws-sdk');
AWS.config.update({accessKeyId: 'AKIAJSGVPK46VRVYMU2A', secretAccessKey: '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'});
AWS.config.update({region: 'us-west-1'});


// TODO: Should we seal the final options object we return? Or make option lookup use dynamic
// methods instead of properties? (`options.vizServerAddress()`)?
// FIXME: Find HOSTNAME from the environment, not config file
// FIXME: We need to grab DATALISTURI using npm path resolution, not as a hard-code UNIX path
// FIXME: Use 'MONGO_{USERNAME,PASSWORD,URLS,DATABASE}' instead of 'MONGO_SERVER' and 'DATABASE'


/**
 * Sane default options (assumes local dev server). All possible options MUST be set to some value
 * here (even just to null) so as to act as an authoritative reference of all possible options.
 * @return {Object} The default options object
 */
function defaults() {
    return {
        HOSTNAME: 'localhost',
        ENVIRONMENT: 'local',

        CLUSTER: util.format('%s.local', (process.env['USER'] || 'localuser')),

        VIZ_LISTEN_ADDRESS: '0.0.0.0',
        VIZ_LISTEN_PORT: 10000,

        // The number of seconds old a GPU ping may be before being considered stale
        GPU_PING_TIMEOUT: 60,

        HTTP_LISTEN_ADDRESS: 'localhost',
        HTTP_LISTEN_PORT: 3000,

        BUCKET: 'graphistry.data',
        S3: new AWS.S3(),

        MONGO_USERNAME: undefined,
        MONGO_PASSWORD: undefined,
        MONGO_HOSTS: ['localhost'],
        MONGO_DATABASE: 'graphistry-local',
        DATABASE: 'graphistry-local',   // legacy option name
        MONGO_REPLICA_SET: undefined,
        // This option will be set by synthesized; it's only here for reference
        MONGO_SERVER: 'mongodb://localhost/graphistry-local',

        BOUNDARY: {
            ENDPOINT: 'https://api.graphdat.com/v1/measurements',
            AUTH: {
                user: 'boundary@graphistry.com',
                pass: 'api.62fb69d814-3713'
            }
        },

        LOCAL_CACHE: true,
        LOCAL_CACHE_DIR: '/tmp/graphistry/data_cache',

        BUNYAN_LOG: undefined,

        //minimum level of messages you'd want going into bunyan log files
        BUNYAN_DEBUG_LEVEL: 10,
        //minimum level of messages you'd want going into stdout
        CONSOLE_DEBUG_LEVEL: 30,


        // This string is prefixed to all Graphistry routes. For example, if BASE_URL is '/foo',
        // then central will append '/vizaddr' to get the route it will listen for viz server
        // address requests, "/foo/vizaddr". This applies to both static and dynamic content.
        BASE_URL: ''
    };
}


/**
 * Parses command-line arguments as JSON and combines that with the existing options.
 * @return {Object} A new set of options combining existing options with command-line options
 */
function commandLine() {
    var commandLineOptions = {};

    if (process.argv.length > 2) {
        try {
            commandLineOptions = JSON.parse(process.argv[2])
        } catch (err) {
            console.warn("WARNING Cannot parse command line arguments, ignoring...");
        }
    }

    return commandLineOptions;
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
        MONGO_USERNAME: 'graphistry',
        MONGO_PASSWORD: 'graphtheplanet',

        MONGO_HOSTS: ['c48.lighthouse.2.mongolayer.com:10048', 'c48.lighthouse.3.mongolayer.com:10048'],
        MONGO_REPLICA_SET: 'set-545152bc461811298c009c03',

        BUNYAN_LOG: '/var/log/graphistry-json/' + process.env.SUPERVISOR_PROCESS_NAME + '.log'
    };

    var stagingOptions = {
        CLUSTER: "staging",

        DATABASE: 'graphistry-staging',
        MONGO_DATABASE: 'graphistry-staging'
    };

    var prodOptions = {
        CLUSTER: "production",

        DATABASE: 'graphistry-prod',
        MONGO_DATABASE: 'graphistry-prod'
    };

    switch(options.ENVIRONMENT) {
        case 'staging':
            return _.extend({}, cloudOptions, stagingOptions);
            break;
        case 'production':
            return _.extend({}, cloudOptions, prodOptions);
            break;
        default:  // 'local'
            return {};
    }
}


/**
 * Sets options based off the value of existing options (except for `ENVIRONMENT`).
 * @param  {Object} options - The set of existing options.
 * @return {Object} A new set of options containing the existing options + new options synthesized
 * from the existing options. The synthesized values will override any existing options of the same
 * name.
 */
function synthesized(options) {
    var mongoServer = getMongoURL(
        options['MONGO_HOSTS'],
        options['MONGO_USERNAME'],
        options['MONGO_PASSWORD'],
        options['MONGO_DATABASE'],
        options['MONGO_REPLICA_SET']);

    return {MONGO_SERVER: mongoServer};
}


/**
 * Creates a MongoDB connection URL from individual parameters
 *
 * @param  {string[]} hosts      - List of MongoDB server hostnames
 * @param  {string} [username]   - MongoDB username (optional)
 * @param  {string} [password]   - MongoDB password (options; if given, username must be given)
 * @param  {string} database     - Name of the database to authenticate against
 * @param  {string} [replicaSet] - The replicaset to use for the MongoDB database (optional)
 *
 * @return {string} A URL you can pass to `MongoClient.connect()` to connect to the database with
 * the options given.
 */
function getMongoURL(hosts, username, password, database, replicaSet) {
    var passwordUrl = _.isString(password) ? util.format(':%s', password) : '';
    var credentialsUrl = _.isString(username) ? util.format('%s%s@', username, passwordUrl) : '';

    var replicaSetUrl = _.isString(replicaSet) ? util.format('?replicaSet=%s', replicaSet) : '';

    var hostsUrl = hosts.join(',');

    return util.format('mongodb://%s%s/%s%s', credentialsUrl, hostsUrl, database, replicaSetUrl);
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
    return _.reduce(arguments, function(resolved, resolver) {
        return _.extend({}, resolved, (_.isFunction(resolver) ? resolver(resolved) : resolver));
    }, {});
}


/**
 * Returns an object containing the current set of resolved options for Graphistry apps.
 * @param  {Object} optionOverrides - Options which will override all other options generators.
 * @return {Object} The set of program options generated by resolving all sources of options.
 */
function getOptions(optionOverrides) {
    optionOverrides = optionOverrides || {};
    var overrides = resolve(commandLine, optionOverrides);

    var optionsResolved = resolve(defaults, overrides, deployEnv, synthesized, overrides);

    logger.debug('Program options resolved to:', optionsResolved);
    return optionsResolved;
};


module.exports = (function() {
    var emptyArgKey = (Math.random()).toString();

    return _.memoize(getOptions, function() {
        return arguments.length > 0 ? JSON.stringify(arguments) : emptyArgKey;
    })
})();

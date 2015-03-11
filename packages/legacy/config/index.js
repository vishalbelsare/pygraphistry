/** @module config */
'use strict';

var util = require('util');
var debug = require('debug')('graphistry:config');
var _ = require('underscore');
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

        BUNYAN_LOG: undefined
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

        MONGO_HOSTS: ['c48.lighthouse.3.mongolayer.com:10048', 'c48.lighthouse.2.mongolayer.com:10048'],
        MONGO_REPLICA_SET: 'set-545152bc461811298c009c03',

        BUNYAN_LOG: '/var/log/worker/' + process.env.SUPERVISOR_PROCESS_NAME + '-error.jlog'
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
            return resolve({}, cloudOptions, stagingOptions);
            break;
        case 'production':
            return resolve({}, cloudOptions, prodOptions);
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
 * Given the set of current program options, run each resolver function (passing in the current
 * options) and then combine their output (with later resolvers taking precedence).
 * @param  {Object} existingOptions - The set of current program options
 *
 * @param  {...Function} resolvers - One or more resolver functions, which take in the set of
 * current program options (as set when resolve is called) and returns the program options to set.
 *
 * @return {Object} The set of program options created by merging the options generated by all
 * resolvers.
 */
function resolve(existingOptions, resolvers) {
    var optionsList = _.chain(arguments)
        .rest()
        .map(function(resolver) {
               return _.isFunction(resolver) ? resolver(existingOptions) : resolver;
            })
        .value()

    return _.extend.apply(_, _.union([{}], optionsList))
}


/**
 * Returns an object containing the current set of resolved options for Graphistry apps.
 * @param  {Object} optionOverrides - Options which will override all other options generators.
 * @return {Object} The set of program options generated by resolving all sources of options.
 */
module.exports = function(optionOverrides) {
    optionOverrides = optionOverrides || {};

    // Resolving all options is a two-step process, since some option generators have output that
    // depends on the value of other options (e.g., deployEnv() looks at options.ENVIRONMENT to
    // determine the values of certain options.)

    // Run all generators and pass each `{}` as the current program options, then resolve these into
    // a set of tentative program options.
    var optionsTentative = resolve({}, defaults, deployEnv, commandLine, optionOverrides);

    // Run a second pass the generators, passing the tentative options as the current program
    // options, then resolve these and use as the ultimate set of program options.
    var optionsFinal = resolve(optionsTentative, defaults, deployEnv, commandLine, optionOverrides);

    debug('Program options resolved to:', optionsFinal);

    return optionsFinal;
};

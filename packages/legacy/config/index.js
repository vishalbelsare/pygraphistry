'use strict';

// FIXME: Once we connect to mongo using a URL, don't re-connect to the given database
// FIXME: Find hostname from the environment, not config file
// FIXME: We need to grab DATALISTURI using npm path resolution, not as a hard-code UNIX path
// FIXME: Use 'MONGO_{USERNAME,PASSWORD,URLS,DATABASE}' instead of 'MONGO_SERVER' and 'DATABASE'


var _ = require('underscore');


/**
 * Sane default options (assumes local dev server). All possible options MUST be set to some value
 * here (even just to null) so as to act as an authoritative reference of all possible options.
 * @return {Object} - The default options object
 */
function defaults() {
    return {
        HOSTNAME: 'localhost',
        ENVIRONMENT: 'local',

        VIZ_LISTEN_ADDRESS: '0.0.0.0',
        VIZ_LISTEN_PORT: 10000,

        HTTP_LISTEN_ADDRESS: 'localhost',
        HTTP_LISTEN_PORT: 3000,

        DATALISTURI: 'node_modules/datasets/all.json',

        MONGO_SERVER: 'mongodb://localhost:27017/graphistry-local',
        DATABASE: 'graphistry-local',

        MONGO_USERNAME: '',
        MONGO_PASSWORD: '',
        MONGO_HOSTS: ['localhost:27017'],
        MONGO_DATABASE: 'graphistry-local'
    };
}


/**
 * Parses command-line arguments as JSON and combines that with the existing options
 * @param  {Object} options - The existing options
 * @return {Object} A new set of options combining existing options with command-line options
 */
function commandLine(options) {
    var commandLineOptions = {};

    if (process.argv.length > 2) {
        try {
            commandLineOptions = JSON.parse(process.argv[2])
        } catch (err) {
            console.warn("WARNING Cannot parse command line arguments, ignoring...");
        }
    }

    return _.extend({}, options, commandLineOptions);
}


/**
 * Sets/modifies the existing options based off the current `ENVIRONMENT` option value
 * @param  {Object} options - the set of options already set via other methods
 * @return {Object} A new set of options combining existing options with ENVIRONMENT options
 */
function deployEnv(options) {
    // Common options for 'staging' and 'production'
    var serverOptions = {
        MONGO_USERNAME: 'graphistry',
        MONGO_PASSWORD: 'graphtheplanet',
        MONGO_HOSTS: ['lighthouse.2.mongolayer.com:10048', 'lighthouse.3.mongolayer.com:10048']
    };

    var stagingOptions = {
        DATABASE: 'graphistry-staging',
        MONGO_SERVER: 'mongodb://graphistry:graphtheplanet@lighthouse.2.mongolayer.com:10048,lighthouse.3.mongolayer.com:10048/graphistry-staging',

        MONGO_DATABASE: 'graphistry-staging'
    };

    var prodOptions = {
        DATABASE: 'graphistry-prod',
        MONGO_SERVER: 'mongodb://graphistry:graphtheplanet@lighthouse.2.mongolayer.com:10048,lighthouse.3.mongolayer.com:10048/graphistry-prod',

        MONGO_DATABASE: 'graphistry-prod'
    };

    switch(options.ENVIRONMENT) {
        case 'staging':
            return _.extend({}, options, serverOptions, stagingOptions);
            break;
        case 'production':
            return _.extend({}, options, serverOptions, prodOptions);
            break;
        default:  // 'local'
            return _.extend({}, options);
    }
}


module.exports = function() {
    var defaultOptions = defaults();
    var commandOptions = commandLine(defaultOptions);
    var deployOptions = deployEnv(commandOptions);

    return deployOptions;
};

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
        DATABASE: 'graphistry-local'
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
    var localOptions = {
        ENVIRONMENT: 'local',
        DATABASE: 'mongodb://localhost:27017/graphistry-local',
        MONGO_SERVER: 'graphistry-local'
    };

    var stagingOptions = {
        DATABASE: 'graphistry-staging',
        MONGO_SERVER: 'mongodb://graphistry:graphtheplanet@lighthouse.2.mongolayer.com:10048,lighthouse.3.mongolayer.com:10048/graphistry-staging'
    };

    var prodOptions = {
        DATABASE: 'graphistry-prod',
        MONGO_SERVER: 'mongodb://graphistry:graphtheplanet@lighthouse.2.mongolayer.com:10048,lighthouse.3.mongolayer.com:10048/graphistry-prod'
    };

    switch(options.ENVIRONMENT) {
        case 'staging':
            return _.extend({}, options, stagingOptions);
            break;
        case 'production':
            return _.extend({}, options, prodOptions);
            break;
        default:  // 'local'
            return _.extend({}, options, localOptions);
            break;
    }
}


module.exports = function() {
    var defaultOptions = defaults();
    var commandOptions = commandLine(defaultOptions);
    var deployOptions = deployEnv(commandOptions);

    return deployOptions;
};

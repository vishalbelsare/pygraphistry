var _ = require('underscore');

module.exports = function() {
    var defaultOptions = {
        VIZ_LISTEN_ADDRESS: '0.0.0.0',
        VIZ_LISTEN_PORT: 10000,
        HTTP_LISTEN_ADDRESS: 'localhost',
        HTTP_LISTEN_PORT: 3000,
        MONGO_SERVER: 'localhost',
        DATABASE: 'graphistry-dev',
        HOSTNAME: 'localhost',
        DATALISTURI: 'node_modules/datasets/all.json',
        ENVIRONMENT: 'local'
    };

    var commandLineOptions = {};
    if (process.argv.length > 2) {
        try {
            commandLineOptions = JSON.parse(process.argv[2])
        } catch (err) {
            console.warn("WARNING Cannot parse command line arguments, ignoring...");
        }
    }

    var options = _.extend(defaultOptions, commandLineOptions);

    // Supervisor passes "PRODUCTION" = true as a command line arg in prod
    if (options.ENVIRONMENT == 'production') {
        options.DATABASE = 'graphistry-prod';
        options.MONGO_SERVER = 'mongodb://graphistry:graphtheplanet@lighthouse.2.mongolayer.com:10048,lighthouse.3.mongolayer.com:10048/graphistry-prod';
    }

    if (options.ENVIRONMENT == 'staging') {
        options.DATABASE = 'graphistry-staging';
        options.MONGO_SERVER = 'mongodb://graphistry:graphtheplanet@lighthouse.2.mongolayer.com:10048,lighthouse.3.mongolayer.com:10048/graphistry-staging';
    }

    return options;
};

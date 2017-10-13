const convict = require('convict');
const Path = require('path');

// Define a schema
var config = convict({
    env: {
        doc: 'The node environment',
        format: ['production', 'development', 'test'],
        default: 'development',
        env: 'NODE_ENV'
    }
});

// Perform validation
config.validate({ allowed: 'strict' });

module.exports = config;

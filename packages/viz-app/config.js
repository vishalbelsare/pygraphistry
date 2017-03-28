// Warning: only use Node.js natively supported JavaScript features in this file. It is imported
// and run directly into Node, without Babel complication, by the root `viz-server/index.js`.

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const convict = require('convict');

const configSchema = require('./config-schema.js');

// Define a schema
const conf = convict(configSchema);


function loadConfigFiles() {
    let configFiles = [];

    if (process.env.CONFIG_FILES) {
        // eslint-disable-next-line no-console
        console.log(`$CONFIG_FILES environment variable set to "${process.env.CONFIG_FILES}". Will use that value instead of the files in './config/*.json'`);
        configFiles = process.env.CONFIG_FILES
            .split(',')
            .map(function(configFilePath) { return configFilePath.trim() });
    } else {
        const defaultConfigPath = path.resolve('.', 'config', '*.json');
        configFiles = glob.sync(defaultConfigPath);
    }

    const validConfigFiles = configFiles.filter(function(configFilePath) {
        if(!fs.existsSync(configFilePath)) {
            console.error(`Warning: config file "${configFilePath}" does not exist, and will be omitted from config file loading.`);
            return false;
        } else {
            return true;
        }
    })

    if (validConfigFiles.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`Loading configuration from ${validConfigFiles.join(', ')}`);
        conf.loadFile(validConfigFiles);
    }

    return validConfigFiles;
}

loadConfigFiles();
conf.validate({ strict: true });

module.exports = conf;
module.exports.conf = conf;
module.exports.default = conf;

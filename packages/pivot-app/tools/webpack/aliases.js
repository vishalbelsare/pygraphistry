const path = require('path');

module.exports = addAliases;

function addAliases({ type, isDev }, appConfig) {
    if (type === 'client') {
        appConfig.resolve.alias['mv'] = path.resolve(process.cwd(), './src/logger/empty-shim.js');
        appConfig.resolve.alias['fs'] = path.resolve(process.cwd(), './src/logger/empty-shim.js');
        appConfig.resolve.alias['@graphistry/common'] = path.resolve(process.cwd(), './src/logger');
        appConfig.resolve.alias['dtrace-provider'] = path.resolve(process.cwd(), './src/logger/empty-shim.js');
        appConfig.resolve.alias['safe-json-stringify'] = path.resolve(process.cwd(), './src/logger/empty-shim.js');
    }
    if (!isDev) {
        appConfig.resolve.alias['debug'] = path.resolve(process.cwd(), './src/logger/empty-debug-shim.js');
    }
    return appConfig;
}

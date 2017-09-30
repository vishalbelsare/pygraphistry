module.exports = addEntries;
const convict = require('../../config');
const mountPoint = convict.get('pivotApp.mountPoint');

function addEntries({ type, isDev, vendor }, appConfig) {

    appConfig.entry = { [type]: [`./src/${type}/index.js`] };

    if (type === 'client' && isDev) {
        appConfig.entry[type].unshift(
            'react-hot-loader/patch',
            `webpack-hot-middleware/client?path=${mountPoint}/_hmr/`
        );
    }

    return appConfig;
}

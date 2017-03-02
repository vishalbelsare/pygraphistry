module.exports = addEntries;

function addEntries({ type, isDev, vendor }, appConfig) {

    appConfig.entry = { [type]: [`./src/${type}/index.js`] };

    if (type === 'client') {
        if (!isDev) {
            appConfig.entry.vendor = vendor;
        } else {
            appConfig.entry[type].unshift(
                'react-hot-loader/patch',
                'webpack-hot-middleware/client?reload=true'
            );
        }
    }

    return appConfig;
}

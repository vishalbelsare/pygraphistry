process.noDeprecation = true;

const path = require('path');
const webpack = require('webpack');
const WebpackNodeExternals = require('webpack-node-externals');
const makeWebpackConfig = require('./webpack.config');
const karmaWebpackConfig = makeWebpackConfig({
    type: 'server',
    environment: 'development'
});

delete karmaWebpackConfig.name;
delete karmaWebpackConfig.entry;
delete karmaWebpackConfig.output;

karmaWebpackConfig.externals = [
    // native modules will be excluded, e.g require('react/server')
    WebpackNodeExternals({
        whitelist: [
            // Load non-javascript files with extensions, presumably via loaders
            /\.(?!(?:jsx?|json)$).{1,5}$/i
        ],
    }),
];

karmaWebpackConfig.plugins.splice(7, 2); // splice out `StatsPlugin` and `WriteFilePlugin`
karmaWebpackConfig.plugins.splice(4, 2,  // splice out `AssetsPlugin` and `EnvironmentPlugin`
    // set `NODE_ENV` to 'production' to make React shut up
    new webpack.EnvironmentPlugin({ NODE_ENV: 'production' }),
    new webpack.BannerPlugin({
        raw: true,
        entryOnly: true,
        banner: `require('source-map-support').install({environment:'node'});require('raf').polyfill();`
    }),
);

// splice out `GaugeProgressBarPlugin`
karmaWebpackConfig.plugins.splice(0, 1);

module.exports = karmaWebpackConfig;

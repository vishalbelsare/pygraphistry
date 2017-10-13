process.noDeprecation = true;

const path = require('path');
const webpack = require('webpack');
const makeWebpackConfig = require('./webpack.config');
const karmaWebpackConfig = makeWebpackConfig({
    type: 'client',
    environment: 'development'
});

delete karmaWebpackConfig.name;
delete karmaWebpackConfig.entry;
delete karmaWebpackConfig.output;

karmaWebpackConfig.devtool = 'inline-source-map';

// Required for enzyme to work properly
karmaWebpackConfig.externals = {
    cheerio: 'window',
    'react/addons': 'react/addons',
    'react-addons-test-utils': 'react-dom',
    'react/lib/ReactContext': 'react/lib/ReactContext',
    'react/lib/ExecutionEnvironment': 'react/lib/ExecutionEnvironment'
};

karmaWebpackConfig.plugins.splice(7, 2); // splice out `StatsPlugin` and `WriteFilePlugin`
karmaWebpackConfig.plugins.splice(
    4,
    2, // Splice out `AssetsPlugin` and `EnvironmentPlugin`
    // set `NODE_ENV` to 'production' to make React shut up
    new webpack.EnvironmentPlugin({ NODE_ENV: 'production' })
);

module.exports = karmaWebpackConfig;

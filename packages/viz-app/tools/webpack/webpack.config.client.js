process.noDeprecation = true;

const path = require('path');
const webpack = require('webpack');
const makeWebpackConfig = require('./webpack.config');
const isDev = process.env.NODE_ENV !== 'production';
const clientWebpackConfig = makeWebpackConfig({
    type: 'client',
    environment: process.env.NODE_ENV,
    output: {
        path: path.join(process.cwd(), './build/public'),
    }
});

clientWebpackConfig.plugins.push(
    new webpack.DefinePlugin({
        global: `window`
    })
);

if (isDev) {
    clientWebpackConfig.plugins.push(
      // Prints more readable module names in the browser console on HMR updates
      new webpack.NamedModulesPlugin(),
      new webpack.HotModuleReplacementPlugin()
    );
} else {
    clientWebpackConfig.plugins.push(
        new webpack.HashedModuleIdsPlugin(),
        new webpack.optimize.CommonsChunkPlugin({
            name: 'vendor', minChunks: Infinity
        })
    );
}

module.exports = clientWebpackConfig;

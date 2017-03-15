process.noDeprecation = true;

const path = require('path');
const webpack = require('webpack');
const makeWebpackConfig = require('./webpack.config');
const isDev = process.env.NODE_ENV !== 'production';
const clientWebpackConfig = makeWebpackConfig({
    type: 'client',
    environment: process.env.NODE_ENV,
    output: {
        publicPath: '/',
        path: path.join(process.cwd(), './www/public'),
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
        new webpack.HotModuleReplacementPlugin({ multiStep: false })
    );
} else {
    clientWebpackConfig.plugins.push(
        new webpack.HashedModuleIdsPlugin(),
        new webpack.optimize.CommonsChunkPlugin({
            name: 'vendor',
            minChunks: function (module) {
               // this assumes your vendor imports exist in the node_modules directory
               return module.context && module.context.indexOf('node_modules') !== -1;
            }
        }),
        new webpack.optimize.CommonsChunkPlugin({
            name: 'manifest'
        })
    );
}

module.exports = clientWebpackConfig;

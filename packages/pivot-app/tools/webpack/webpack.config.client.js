process.noDeprecation = true;

const path = require('path');
const webpack = require('webpack');
const convict = require('../../config');
const mountPoint = convict.get('pivotApp.mountPoint');
const makeWebpackConfig = require('./webpack.config');
const isDev = process.env.NODE_ENV !== 'production';
const clientWebpackConfig = makeWebpackConfig({
    type: 'client',
    statsPath: '..',
    environment: process.env.NODE_ENV,
    output: {
        publicPath: `${mountPoint}/`,
        path: path.join(process.cwd(), './www/public'),
    }
});

// clientWebpackConfig.node = {
//     fs: 'empty',
//     global: false,
//     __filename: true
// };

clientWebpackConfig.plugins.push(
    new webpack.DefinePlugin({
        global: `window`
    })
);

if (isDev) {
    clientWebpackConfig.plugins.push(
        // Prints more readable module names in the browser console on HMR updates
        new webpack.NamedModulesPlugin(),
        new webpack.HotModuleReplacementPlugin({ multiStep: false }),
        new webpack.BannerPlugin({
            raw: true,
            entryOnly: true,
            banner: `require('source-map-support');`
        })
    );
} else {
    clientWebpackConfig.plugins.push(
        new webpack.HashedModuleIdsPlugin(),
        new webpack.optimize.CommonsChunkPlugin({
            name: 'vendor',
            minChunks: function (module) {
               // this assumes our vendor imports exist in the node_modules directory
               return module.context && module.context.indexOf('node_modules') !== -1;
            }
        }),
        new webpack.optimize.CommonsChunkPlugin({
            name: 'manifest'
        })
    );
}

module.exports = clientWebpackConfig;

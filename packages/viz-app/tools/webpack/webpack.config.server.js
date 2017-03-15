process.noDeprecation = true;

const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const WebpackNodeExternals = require('webpack-node-externals');
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');
const makeWebpackConfig = require('./webpack.config');
const isDev = process.env.NODE_ENV !== 'production';
const serverWebpackConfig = makeWebpackConfig({
    type: 'server',
    environment: process.env.NODE_ENV,
    output: {
        libraryTarget: 'commonjs2',
        path: path.join(process.cwd(), './www'),
    }
});

// serverWebpackConfig.devtool = isDev ? 'cheap-module-eval-source-map' : 'cheap-module-source-map';
serverWebpackConfig.devServer = {
    outputPath: path.join(process.cwd(), './www')
};

serverWebpackConfig.externals = [
    // these assets produced by webpack and assets-webpack-plugin
    /^.+(stats|assets)\.json$/i,
    // native modules will be excluded, e.g require('react/server')
    WebpackNodeExternals({
        whitelist: [
            // Load non-javascript files with extensions, presumably via loaders
            /\.(?!(?:jsx?|json)$).{1,5}$/i
        ],
    }),
];

serverWebpackConfig.node = {
    Buffer: false, global: false,
    console: false, process: false,
    __dirname: true, __filename: true,
};

if (isDev) {
    serverWebpackConfig.plugins.push(
        // Prints more readable module names in the browser console on HMR updates
        new webpack.NamedModulesPlugin(),
        new webpack.HotModuleReplacementPlugin({ multiStep: false })
    );
}

serverWebpackConfig.plugins.push(
    new webpack.DefinePlugin({
        window: `global`,
        navigator: `global`
    }),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    new webpack.BannerPlugin({
        raw: true,
        entryOnly: true,
        // banner: `require('raf').polyfill();`
        banner: isDev ?                                             `require('raf').polyfill();` :
        `require('source-map-support').install({environment:'node'});require('raf').polyfill();`
    }),
    new FaviconsWebpackPlugin({
        emitStats: true,
        prefix: '/public/favicons/',
        statsFilename: 'favicon-assets.json',
        logo: path.resolve(process.cwd(), './src/assets/img/logo_g.png'),
    }),
    new CopyWebpackPlugin([
        { from: 'src/assets/img', to: 'public/img' },
    ], {
        copyUnmodified: false,
        ignore: ['.DS_STORE']
    })
);

module.exports = serverWebpackConfig;

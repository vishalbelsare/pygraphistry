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
        path: path.join(process.cwd(), './build'),
    }
});

serverWebpackConfig.devServer = {
    outputPath: path.join(process.cwd(), './build')
};

serverWebpackConfig.externals = [
    // these assets produced by assets-webpack-plugin
    /^.+stats\.json$/i,
    // native modules will be excluded, e.g require('react/server')
    WebpackNodeExternals({
        // Load non-javascript files with extensions, presumably via loaders
        whitelist: [/\.(?!(?:jsx?|json)$).{1,5}$/i],
    }),
];

serverWebpackConfig.node = {
    Buffer: false, global: false,
    console: false, process: false,
    __dirname: true, __filename: true,
};

serverWebpackConfig.plugins.push(
    new webpack.DefinePlugin({
        window: `global`,
        navigator: `global`
    }),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    new webpack.BannerPlugin({
        raw: true,
        entryOnly: true,
        banner: `require('raf').polyfill();`
    }),
    new FaviconsWebpackPlugin({
        emitStats: true,
        prefix: '/public/favicons/',
        statsFilename: 'favicon-stats.json',
        logo: path.resolve(process.cwd(), './src/assets/img/logo_g.png'),
    }),
    new CopyWebpackPlugin([
        // { from: 'src/viz-worker/static' },
        { from: 'src/assets/img', to: 'public/img' },
        // { from: 'src/viz-worker/kernels', to: 'kernels/' },
    ], {
        copyUnmodified: false,
        ignore: ['.DS_STORE']
    })
);

module.exports = serverWebpackConfig;

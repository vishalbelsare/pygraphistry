const path = require('path');
const webpack = require('webpack');
const HappyPack = require('happypack');
const StatsPlugin = require('stats-webpack-plugin');
const AssetsPlugin = require('assets-webpack-plugin');
const WriteFilePlugin = require('write-file-webpack-plugin');
const BabiliWebpackPlugin = require('babili-webpack-plugin');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const ClosureCompilerPlugin = require('webpack-closure-compiler');

HappyPack.SERIALIZABLE_OPTIONS = HappyPack.SERIALIZABLE_OPTIONS.concat(['postcss']);

const addAliases = require('./aliases');
const addEntries = require('./entries');
const addBabelRules = require('./babel');
const addStyleRules = require('./styles');
const { CSSModules, versions, vendor } = require('./defines');

module.exports = makeWebpackConfig;

function makeWebpackConfig({
    output = {},
    type = 'client',
    statsPath = '.',
    environment = 'production',
    numCPUs = require('os').cpus().length || 4
} = {}) {
    const isDev = environment !== 'production';
    const threadPool = HappyPack.ThreadPool({ size: numCPUs });
    const options = {
        type, isDev,
        vendor, numCPUs,
        versions, threadPool,
        CSSModules, environment,
    };
    const baseConfig = {
        amd: false,
        name: type,
        cache: isDev,
        context: path.join(process.cwd()),
        target: type === 'client' ? 'web' : 'node',
        devtool: isDev ? 'source-map' : 'nosources-source-map',
        stats: { assets: false, colors: true, chunks: false, warnings: true },
        output: Object.assign({
            publicPath: '',
            // Don't use chunkhash in development it will increase compilation time
            filename: isDev ? '[name].js' : '[name].[chunkhash:8].js',
            chunkFilename: isDev ? '[name].chunk.js' : '[name].[chunkhash:8].chunk.js',
        }, output),
        resolve: {
            modules: ['src', 'node_modules'],
            extensions: ['.js', '.jsx', '.json'],
            alias: {
                'viz-app': path.resolve(process.cwd(), './src'),
                'react-split-pane': '@graphistry/react-split-pane',
                'moment': path.resolve(process.cwd(), './node_modules/moment/min/moment.min.js'),
                '@graphistry/falcor': path.resolve(process.cwd(), isDev ?
                    './node_modules/@graphistry/falcor/dist/falcor.all.js' :
                    './node_modules/@graphistry/falcor/dist/falcor.all.min.js'
                )
            }
        },
        module: {
            noParse: [
                /node_modules\/brace/,
                // /node_modules\/lodash/,
                /node_modules\/underscore/,
                /node_modules\/pegjs-util\/PEGUtil\.js/,
                /node_modules\/\@graphistry\/falcor\/dist\/falcor.all.min.js/,
                /node_modules\/\@graphistry\/falcor-query-syntax\/lib\/paths\-parser\.js$/,
                /node_modules\/\@graphistry\/falcor-query-syntax\/lib\/route\-parser\.js$/
            ],
            rules: [
                { test: /\.glsl$/, loader: 'webpack-glsl-loader' },
                { test: /\.pegjs$/, loader: 'pegjs-loader?cache=true&optimize=size' },
                {
                    test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
                    use: [{
                        loader: 'file-loader',
                        options: {
                            name: 'fonts/[name]_[hash:6].[ext]',
                            publicPath: '',
                        }
                    }]
                },
                {
                    test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
                    use: [{
                        loader: 'file-loader',
                        options: {
                            name: 'fonts/[name]_[hash:6].[ext]',
                            publicPath: '',
                            mimetype: 'image/svg+xml'
                        }
                    }]
                },
                {
                    test: /\.woff(\?v=\d+\.\d+\.\d+)?$/,
                    use: [{
                        loader: 'file-loader',
                        options: {
                            name: 'fonts/[name]_[hash:6].[ext]',
                            publicPath: '',
                            mimetype: 'application/font-woff'
                        }
                    }]
                },
                {
                    test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/,
                    use: [{
                        loader: 'file-loader',
                        options: {
                            name: 'fonts/[name]_[hash:6].[ext]',
                            publicPath: '',
                            mimetype: 'application/font-woff'
                        }
                    }]
                },
                {
                    test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
                    use: [{
                        loader: 'file-loader',
                        options: {
                            name: 'fonts/[name]_[hash:6].[ext]',
                            publicPath: '',
                            mimetype: 'application/octet-stream'
                        }
                    }]
                },
            ],
        },
        plugins: [
            new webpack.NoEmitOnErrorsPlugin(),
            new ProgressBarPlugin({ clear: false, }),
            new webpack.ProvidePlugin({ React: 'react' }),
            new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
            new AssetsPlugin({
                filename: `${type}-assets.json`,
                path: path.join(process.cwd(), './www')
            }),
            // Setup enviorment variables for client
            new webpack.EnvironmentPlugin({ NODE_ENV: JSON.stringify(environment) }),
            // Setup global variables for client
            new webpack.DefinePlugin(Object.assign({}, versions, {
                __CLIENT__: JSON.stringify(type === 'client'),
                __SERVER__: JSON.stringify(type === 'server'),
                __DISABLE_SSR__: JSON.stringify(false),
            })),
            // See http://webpack.github.io/analyse/
            new StatsPlugin(
                `${statsPath}/${type}-stats.json`,
                { chuckModules: true, chucks: true, timings: true }
            )
        ]
    };

    if (isDev) {
        baseConfig.plugins.push(new WriteFilePlugin({ log: false }));
    } else {
        // baseConfig.plugins.push(new BabiliWebpackPlugin({
        //     eval: false,
        //     mangle: true,
        //     deadcode: true,
        //     topLevel: false,
        // }));
        baseConfig.plugins.push(new ClosureCompilerPlugin({
            concurrency: numCPUs,
            compiler: {
                language_in: 'ECMASCRIPT6',
                language_out: 'ECMASCRIPT5',
                compilation_level: 'SIMPLE',
                rewrite_polyfills: false,
                use_types_for_optimization: false,
                warning_level: 'QUIET',
                jscomp_off: '*',
                jscomp_warning: '*',
                source_map_format: 'V3',
                create_source_map: true
            },
        }));
    }

    return addAliases(options,
           addEntries(options,
        addBabelRules(options,
        addStyleRules(options, baseConfig))));
}

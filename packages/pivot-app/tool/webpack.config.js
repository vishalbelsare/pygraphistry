var path = require('path');
var webpack = require('webpack');
var vizAppPackage = require('../package.json');
var AssetsPlugin = require('assets-webpack-plugin');
var WebpackDashboard = require('webpack-dashboard/plugin');
var NPMInstallPlugin = require('npm-install-webpack-plugin');
var WebpackVisualizer = require('webpack-visualizer-plugin');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var WebpackNodeExternals = require('webpack-node-externals');
var StringReplacePlugin = require('string-replace-webpack-plugin');
var FaviconsWebpackPlugin = require('favicons-webpack-plugin');
var ProgressBarPlugin = require('progress-bar-webpack-plugin');
var child_process = require('child_process');


const buildNumber = process.env.BUILD_NUMBER;
const buildDate = Date.now();

function getCommitId() {
    const commitId = process.env.COMMIT_ID;
    if (commitId) {
        return commitId;
    } else {
        return child_process.execSync('git rev-parse --short HEAD').toString().trim();
    }
}

function getRevName() {
    const revName = process.env.REV_NAME;
    if (revName) {
        return revName;
    } else {
        return child_process.execSync('git name-rev --name-only HEAD').toString().trim();
    }
}

const versionDefines = {
    __RELEASE__: undefined,
    __GITCOMMIT__: `"${getCommitId()}"`,
    __GITBRANCH__: `"${getRevName()}"`,
    __BUILDDATE__: `${buildDate}`,
    __BUILDNUMBER__: buildNumber ? `"${buildNumber}"` : undefined,
}

function postcss(webpack) {
    return [
        require('postcss-font-awesome'),
        require('autoprefixer')
    ];
}


function commonConfig(buildOpts) {
    return {
        amd: false,
        quiet: buildOpts.isDev,
        progress: !buildOpts.isDev,
        // Create Sourcemaps for the bundle
        devtool: 'source-map',
        postcss: postcss,
        resolve: {
            unsafeCache: true,
        },
        module: {
            loaders: loaders(buildOpts),
            noParse: [
                /reaxtor-falcor-syntax-pathmap\/lib\/parser\.js$/
            ]
        },
        plugins: plugins(buildOpts),
        stats: {
            // See https://webpack.github.io/docs/node.js-api.html
            errorDetails: true,
            // Display chunks
            chunks: true,
            // Nice colored output
            colors: true
        }
    };
}


function clientConfig(buildOpts = {}) {
    var config = commonConfig(buildOpts);

    config.node = { fs: 'empty', global: false };
    config.target = 'web';

    config.entry = {
        client: './src/client/entry.js',
        vendor: [
            'react', 'rxjs', 'convict', 'react-bootstrap', 'react-bootstrap-table',
            'lodash', 'react-select', 'react-overlays', 'recompose', 'underscore',
            'bunyan', 'redux', 'redux-observable', 'react-redux',
            '@graphistry/falcor',
            '@graphistry/falcor-json-graph',
            '@graphistry/falcor-path-syntax',
            '@graphistry/falcor-path-utils',
            '@graphistry/falcor-query-syntax',
            '@graphistry/falcor-react-redux',
            '@graphistry/falcor-router',
            '@graphistry/falcor-socket-datasource'
        ]
    };

    config.output = {
        path: path.resolve('./build/public'),
        publicPath: '/',
        pathinfo: buildOpts.isDev,
        filename: 'clientBundle.js'
    };

    config.module.loaders = [
        ...config.module.loaders,
        {
            test: /\.css$/,
            loader: buildOpts.isDev ? 'style!css!postcss' : ExtractTextPlugin.extract({
                loader: 'css!postcss'
            })
        },
        {
            test: /\.less$/,
            loader: buildOpts.isDev ?
                'style!css?module&-minimize&localIdentName=[local]_[hash:6]!postcss!less' :
                ExtractTextPlugin.extract({
                    loader: 'css?module&minimize&localIdentName=[local]_[hash:6]!postcss!less'
                })
        }
    ];

    config.plugins = [
        ...config.plugins,
        new webpack.optimize.CommonsChunkPlugin({
            name: 'vendor',
            minChunks: Infinity,
            filename: 'vendor.bundle.js'
        }),
        new AssetsPlugin({ path: path.resolve('./build') }),
        new webpack.DefinePlugin(
            Object.assign(
                {},
                {
                    global: 'window',
                    DEBUG: buildOpts.isDev,
                    __DEV__: buildOpts.isDev,
                    __CLIENT__: true,
                    __SERVER__: false,
                    'process.env.NODE_ENV': '"production"',
                },
                versionDefines
            )
        ),
    ];

    if (buildOpts.genStats) {
        config.plugins.push(
            new WebpackVisualizer({
                filename: `${config.output.filename}.stats.html`
            })
        )
    }

    return config;
}


function serverConfig(buildOpts = {}) {
    var config = commonConfig(buildOpts);

    config.node = {
        console: true,
        __filename: true,
        __dirname: true
    };

    config.target = 'node';

    config.entry = { server: './src/server/entry.js' };

    config.output = {
        path: path.resolve('./build/server'),
        filename: 'serverBundle.js',
        libraryTarget: 'commonjs2'
    };

    config.externals = [
        // native modules will be excluded, e.g require('react/server')
        WebpackNodeExternals(),
        // these assets produced by assets-webpack-plugin
        /^.+assets\.json$/i,
    ];

    config.module.loaders = [
        ...config.module.loaders,
        {
            test: /\.less$/,
            loader: `css/locals?module&localIdentName=[local]_[hash:6]!postcss!less`
        }
    ];


    config.plugins = [
        ...config.plugins,
        new webpack.BannerPlugin({
            raw: true,
            entryOnly: true,
            banner: `require('source-map-support').install({ environment: 'node' });`
        }),
        new webpack.DefinePlugin(
            Object.assign(
                {},
                {
                    window: 'global',
                    DEBUG: buildOpts.isDev,
                    __DEV__: buildOpts.isDev,
                    __CLIENT__: false,
                    __SERVER__: true,
                    'process.env.NODE_ENV': '"production"',
                },
                versionDefines
            )
        ),
    ];

    if (!buildOpts.isDev) {
        config.plugins.push(
            new FaviconsWebpackPlugin({
                logo: './src/static/img/logo_g.png',
                emitStats: true,
                statsFilename: 'favicon-assets.json',
                icons: {
                    android: false,
                    appleIcon: false,
                    appleStartup: false,
                    coast: false,
                    favicons: true,
                    firefox: false,
                    opengraph: false,
                    twitter: false,
                    yandex: false,
                    windows: false
                }
            })
        )
    }

    if (buildOpts.genStats) {
        config.plugins.push(
            new WebpackVisualizer({
                filename: `${config.output.filename}.stats.html`
            })
        )
    }

    return config;
}


function loaders(buildOpts) {
    return [
        babel(),
        { test: /\.json$/, loader: 'json' },
        { test: /\.proto$/, loader: 'proto-loader' },
        { test: /\.(hbs|handlebars)$/, loader: 'handlebars-loader' },
        { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, loader: "url?&name=[name]_[hash:6].[ext]" },
        { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/, loader: "url?&name=[name]_[hash:6].[ext]&limit=10000&mimetype=image/svg+xml" },
        { test: /\.woff(\?v=\d+\.\d+\.\d+)?$/, loader: "url?&name=[name]_[hash:6].[ext]&limit=10000&mimetype=application/font-woff" },
        { test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/, loader: "url?&name=[name]_[hash:6].[ext]&limit=10000&mimetype=application/font-woff" },
        { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/, loader: "url?&name=[name]_[hash:6].[ext]&limit=10000&mimetype=application/octet-stream" },
        // match everything except [
        //   hb, js, jsx, json, css, scss, less,
        //   html, pegjs, proto, handlebars
        // ] You can add more.
        { test: /\.(?!(hb|jsx?|json|s?css|less|html?|woff|woff2|ttf|eot|svg|pegjs|proto|handlebars)$)([^.]+$)/, loader: 'url?limit=10000&name=[name]_[hash:6].[ext]' },
        { test: /PEGUtil.js$/,
            include: /node_modules\/pegjs-util/,
            loader: StringReplacePlugin.replace({ // from the 'string-replace-webpack-plugin'
                replacements: [{
                    pattern: /typeof define\.amd !== (\"|\')undefined(\"|\')/ig,
                    replacement: function(/*match, p1, offset, string*/) {
                        return false;
                    }
                }]
            })
        }
    ];
    function babel() {
        return {
            test: /\.(js|es6|mjs|jsx)$/,
            exclude: /(node_modules(?!\/rxjs))/,
            loader: 'babel-loader',
            query: {
                babelrc: false,
                cacheDirectory: true, // cache into OS temp folder by default
                passPerPreset: true,
                presets: [
                    { plugins: [ 'transform-runtime' ] },
                    {
                        passPerPreset: false,
                        presets: [['es2015', { modules: false }], 'react', 'stage-0']
                    },
                    'es2015'
                ]
            }
        };
    }
}


function plugins(buildOpts) {
    var plugins = [
        new StringReplacePlugin(),
        // new webpack.NamedModulesPlugin(),
        // Avoid publishing files when compilation fails
        new webpack.NoErrorsPlugin(),
        new webpack.ProvidePlugin({ React: 'react' }),
        new webpack.LoaderOptionsPlugin({
            debug: buildOpts.isDev,
            minimize: !buildOpts.isDev,
            quiet: false
        }),
        // use this for universal server client rendering
        new ExtractTextPlugin({ allChunks: true, filename: 'styles.css' }),
    ];

    if (buildOpts.isDev) {
        // plugins.push(new NPMInstallPlugin());
        // plugins.push(new WebpackVisualizer());
        plugins.push(new webpack.HotModuleReplacementPlugin());
        if (buildOpts.isFancy) {
            plugins.push(new WebpackDashboard());
        } else {
            plugins.push(new ProgressBarPlugin({
                clear:true,
            }));
        }
    } else {
        // Report progress for prod builds
        plugins.push(new webpack.ProgressPlugin())
        plugins.push(new webpack.optimize.OccurrenceOrderPlugin(true));
        // Deduping is currently broken :(
        // plugins.push(new webpack.optimize.DedupePlugin());
        plugins.push(new webpack.optimize.AggressiveMergingPlugin());
        plugins.push(new webpack.optimize.UglifyJsPlugin({
            compress: { warnings: false },
            mangle: false,
            comments: false,
            sourceMap: true,
            'screw-ie8': true,
        }));
    }

    return plugins;
}


module.exports = [
    clientConfig,
    serverConfig
];

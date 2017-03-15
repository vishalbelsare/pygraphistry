const path = require('path');
const webpack = require('webpack');
const AssetsPlugin = require('assets-webpack-plugin');
const WebpackDashboard = require('webpack-dashboard/plugin');
const WebpackVisualizer = require('webpack-visualizer-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const WebpackNodeExternals = require('webpack-node-externals');
const StringReplacePlugin = require('string-replace-webpack-plugin');
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const StatsPlugin = require('stats-webpack-plugin');
const child_process = require('child_process');


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

function postcss() {
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
        profile: buildOpts.genStats,
        resolve: {
            unsafeCache: true,
            alias: {
                'pivot-client': path.resolve('./src/client'),
                'pivot-shared': path.resolve('./src/shared'),
                'pivot-server': path.resolve('./src/server'),
                'react-split-pane': '@graphistry/react-split-pane',
                '@graphistry/falcor': path.resolve(buildOpts.isDev ?
                    './node_modules/@graphistry/falcor/dist/falcor.all.js' :
                    './node_modules/@graphistry/falcor/dist/falcor.all.min.js'
                )
            }
        },
        module: {
            loaders: loaders(),
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
    const config = commonConfig(buildOpts);

    config.node = {
        fs: 'empty',
        global: false,
        __filename: true
    };
    config.target = 'web';

    config.entry = {
        client: './src/client/entry.js',
        vendor: [
            '@graphistry/falcor',
            '@graphistry/falcor-router',
            '@graphistry/falcor-json-graph',
            '@graphistry/falcor-path-syntax',
            '@graphistry/falcor-path-utils',
            '@graphistry/falcor-query-syntax',
            '@graphistry/falcor-react-redux',
            '@graphistry/falcor-react-schema',
            '@graphistry/falcor-router-saddle',
            '@graphistry/falcor-socket-datasource',
            '@graphistry/graphistry-client',
            'assert',
            'better-react-spinkit',
            'brace-expansion',
            'bn.js',
            'bowser',
            'buffer',
            'bunyan',
            'core-js',
            'disposables',
            'dnd-core',
            'dom-helpers',
            'es-abstract',
            //'fbjs', fbjs does not handle being in the vendor bundle.
            'history',
            'inline-style-prefixer',
            'json3',
            'lodash',
            'lodash.omitby',
            'minimatch',
            'moment',
            'ncp',
            'querystring-es3',
            'pegjs-util',
            'rc-switch',
            'react',
            'react-bootstrap',
            'react-bootstrap-table',
            'react-dates',
            'react-dnd',
            'react-dnd-html5-backend',
            'react-dom',
            'react-input-autosize',
            'react-overlays',
            'react-redux',
            'react-select',
            'react-split-pane',
            'react-style-proptype',
            'react-portal',
            'react-tag-input',
            '@allenfang/react-toastr',
            'recompose',
            'redux',
            'redux-observable',
            'rimraf',
            'rxjs',
            'socket.io-client',
            'source-map',
            'source-map-support',
            'uncontrollable',
            'underscore',
            'util',
            'verror'
        ]
    };

    config.output = {
        path: path.resolve('./build/public'),
        publicPath: '/pivot/',
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
        },
        {
            test: /\.scss$/,
            loader: buildOpts.isDev ?
                'style!css?-minimize&localIdentName=[local]_[hash:6]!postcss!sass' :
                ExtractTextPlugin.extract({
                    loader: 'css?minimize&localIdentName=[local]_[hash:6]!postcss!sass'
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
                    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)//'"production"',
                },
                versionDefines
            )
        ),
    ];

    if (!buildOpts.isDev) {
        config.plugins.push(
            new FaviconsWebpackPlugin({
                logo: './src/client/favicon.png',
                emitStats: true,
                statsFilename: '../server/favicon-assets.json',
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
        );
    }

    if (buildOpts.genStats) {
        config.plugins.push(
            new WebpackVisualizer({
                filename: `${config.output.filename}.stats.html`
            })
        );
        // See http://webpack.github.io/analyse/
        config.plugins.push(
            new StatsPlugin(`${config.output.filename}.stats.json`, {
                chuckModules: true,
                chucks: true,
                timings: true
            })
        );
    }

    return config;
}


function serverConfig(buildOpts = {}) {
    const config = commonConfig(buildOpts);

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
        },
        {
            test: /\.scss$/,
            loader: `css/localIdentName=[local]_[hash:6]!postcss!sass`
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
                    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)//'"production"',
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
        );
        // See http://webpack.github.io/analyse/
        config.plugins.push(
            new StatsPlugin(`${config.output.filename}.stats.json`)
		);
    }

    return config;
}


function loaders() {
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
                    pattern: /typeof define\.amd !== ("|')undefined("|')/ig,
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
    const plugins = [
        new StringReplacePlugin(),
        // new webpack.NamedModulesPlugin(),
        // Avoid publishing files when compilation fails
        new webpack.NoErrorsPlugin(),
        new webpack.ProvidePlugin({
            Rx: 'rxjs/Rx',
            React: 'react',
            _: 'underscore',
            Observable: 'rxjs/Observable'
        }),
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
            compress: {
                warnings: false,
                screw_ie8: true,
            },
            mangle: false,
            comments: false,
            sourceMap: true,
        }));
    }

    return plugins;
}


module.exports = [
    clientConfig,
    serverConfig
];

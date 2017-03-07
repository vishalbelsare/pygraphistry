const HappyPack = require('happypack')

module.exports = addBabelRules;

function addBabelRules({ isDev, type, environment, threadPool }, appConfig) {
    appConfig.plugins.push(happyBabelPlugin(isDev, type, environment, threadPool));
    appConfig.module.rules.push({
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'happypack/loader?id=js',
    });
    return appConfig;
}

function happyBabelPlugin(isDev, type, environment, threadPool) {
    return new HappyPack({
        id: 'js',
        verbose: false,
        threadPool: threadPool,
        cacheContext: { env: environment },
        loaders: [
            // {
            //     test: /\.jsx?$/,
            //     enforce: 'pre',
            //     exclude: /node_modules/,
            //     loader: 'eslint-loader',
            //     options: { quiet: true, failOnError: false, },
            // },
            {
                loader: 'babel-loader',
                exclude: /(node_modules(?!\/rxjs))/,
                options: {
                    babelrc: false,
                    cacheDirectory: isDev,
                    presets: [
                        // ['env', {
                        //     loose: true,
                        //     modules: false,
                        //     useBuiltIns: true,
                        //     exclude: ['transform-regenerator'],
                        //     targets: {
                        //         node: type === 'client' ? false : 'current',
                        //         browsers: type === 'client' ? ['last 2 versions'] : false
                        //     }
                        // }],
                        ['es2015', { modules: false, loose: true }],
                        'react',
                        // ['babili', {
                        //     mangle: false,
                        //     deadcode: true,
                        //     evaluate: true,
                        // }],
                        'stage-0'
                    ],
                    // presets: [['es2015', { modules: false }], 'react', 'stage-0'],
                    plugins: isDev ? [
                        'transform-runtime',
                        'react-hot-loader/babel'
                      ] : [
                        'transform-runtime',
                        // The Babel "jsx" helper method this plugin uses gets
                        // deoptimized by v8, since it does argument reassignment.
                        // This is no good in a React render() call tree.
                        'transform-react-inline-elements',
                        'transform-react-constant-elements'
                    ],
                    // plugins: ['transform-runtime', 'react-hot-loader/babel'],
              },
            }
        ],
    });
}

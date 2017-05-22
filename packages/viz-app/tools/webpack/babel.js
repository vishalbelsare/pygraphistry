const HappyPack = require('happypack')

module.exports = addBabelRules;

function addBabelRules({ isDev, type, vendor, environment, threadPool }, appConfig) {
    appConfig.plugins.push(happyBabelPlugin(isDev, type, vendor, environment, threadPool));
    appConfig.module.rules.push({
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'happypack/loader?id=js',
    });
    return appConfig;
}

function happyBabelPlugin(isDev, type, vendor, environment, threadPool) {
    const presets = [
        ['env', {
            loose: true,
            modules: false,
            useBuiltIns: true,
            exclude: ['transform-regenerator'],
            targets: {
                node: 'current',
                browsers: 'Last 2 versions'
            }
        }],
        // ['es2015', { modules: false, loose: true }],
        'react',
        // ['babili', {
        //     mangle: false,
        //     deadcode: true,
        //     evaluate: true,
        // }],
        'stage-0'
    ];

    if (type === 'client') {
        presets[0][1].targets.browsers = [
            'Last 2 versions',
            'Firefox >= 35',
            'Chrome >= 50',
            'not ie <= 11',
        ];
    }

    const imports = {
        // 'rxjs': {
        //     'transform': 'rxjs/${member}',
        //     'preventFullImport': false
        // },
        'lodash': {
            'transform': 'lodash/${member}',
            'preventFullImport': true
        },
        'react-bootstrap': {
            'transform': 'react-bootstrap/lib/${member}',
            'preventFullImport': true
        },
        'react-virtualized': {
            'transform': 'react-virtualized/dist/commonjs/${member}/${member}',
            'preventFullImport': true
        }
    };
    // const imports = vendor.reduce((opts, dependency) => {
    //     opts[dependency] = {
    //         'transform': dependency + '/${member}';
    //         // 'transform': 'react-bootstrap/lib/${member}',
    //         'preventFullImport': false
    //     };
    //     return opts;
    // }, {});

    const plugins = [
        'transform-runtime',
        ['transform-imports', imports]
    ];

    if (isDev) {
        plugins.push('react-hot-loader/babel');
    } else {
        plugins.push(
            // Don't use this plugin: it breaks FF31, used by InQTel
            // 'transform-react-inline-elements'
            'transform-react-constant-elements'
        );
    }

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
                    presets: presets,
                    plugins: plugins,
              },
            }
        ],
    });
}

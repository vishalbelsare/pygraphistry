const path = require('path');
const HappyPack = require('happypack')
const ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = addStyleLoaders;

function addStyleLoaders({ type, isDev, threadPool, CSSModules, environment }, appConfig) {

    let rules = [
        {
            test: /\.css$/,
            use: ['happypack/loader?id=css']
        },
        {
            test: /\.less$/,
            use: [
                cssLoader(type, isDev, CSSModules),
                'postcss-loader',
                'happypack/loader?id=less',
            ]
        }
    ];

    if (type === 'client') {

        rules = rules.map((rule) => ({
            test: rule.test,
            loader: ExtractTextPlugin.extract({
                fallback: 'style-loader', use: rule.use,
            })
        }));

        appConfig.plugins.push(new ExtractTextPlugin({
            disable: isDev, // Disable css extracting on development
            allChunks: true,
            ignoreOrder: CSSModules,
            filename: '[name].[contenthash:8].css',
        }));
    }

    appConfig.module.rules.push(...rules);

    appConfig.plugins.push(new HappyPack({
        id: 'css',
        verbose: false,
        threadPool: threadPool,
        cacheContext: { env: environment },
        loaders: [cssLoader(type, isDev, false)],
    }));

    appConfig.plugins.push(new HappyPack({
        id: 'less',
        verbose: false,
        threadPool: threadPool,
        cacheContext: { env: environment },
        loaders: [{
            loader: 'less-loader',
            options: {
              sourceMap: false,
              outputStyle: 'expanded',
              sourceMapContents: !isDev,
            },
        }],
    }));

    return appConfig;
}

function cssLoader(type, isDev, CSSModules) {
    return {
        loader: `css-loader${type === 'client' ? '' : '/locals'}`,
        options: {
            minimize: !isDev,
            modules: CSSModules,
            sourceMap: type === 'client',
            context: path.join(process.cwd(), './src'),
            localIdentName: isDev ? '[name]__[local].[hash:base64:5]' : '[hash:base64:5]',
        }
    };
}

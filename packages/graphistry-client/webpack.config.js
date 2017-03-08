var path = require('path');
var webpack = require('webpack');
var OptimizeJsPlugin = require('optimize-js-plugin');
var WebpackVisualizer = require('webpack-visualizer-plugin');
var ClosureCompilerPlugin = require('webpack-closure-compiler');

var isDev = process.env.NODE_ENV === 'development';

var webpackConfig = {
    amd: false,
    // Create Sourcemaps for the bundle
    devtool: isDev ? 'source-map' : 'hidden-source-map',
    entry: { GraphistryJS: ['./src/index.js'] },
    output: {
        path: path.resolve('./lib'),
        filename: `graphistryJS${isDev ? '' : '.min'}.js`,
        // library: 'GraphistryJS',
        libraryTarget: 'umd',
        umdNamedDefine: true
    },
    module: {
        rules: [babel(isDev)],
        noParse: [
            /node_modules\/pegjs-util\/PEGUtil\.js/,
            /\@graphistry\/falcor\/dist/,
            /\@graphistry\/falcor-query-syntax\/lib\/paths\-parser\.js$/,
            /\@graphistry\/falcor-query-syntax\/lib\/route\-parser\.js$/
        ]
    },
    stats: {
        'errors-only': true,
        colors: true /* Nice colored output */
    }
};

webpackConfig.plugins = plugins(webpackConfig, isDev);

module.exports = webpackConfig;

function babel(isDev) {
    return {
        test: /\.(js|es6|mjs|jsx)$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
            babelrc: false,
            cacheDirectory: isDev, // cache into OS temp folder by default
            plugins: ['transform-runtime', 'version-inline'],
            presets: [
                // !isDev ? 'es2016' :
                ['es2015', { modules: false, loose: true }],
                'stage-0'
            ]
        }
    };
}

function plugins(config, isDev) {

    var plugins = [
        new webpack.NoEmitOnErrorsPlugin(),
        new webpack.ProvidePlugin({ 'Promise': 'es6-promise' })
    ];
    if (isDev) {
        plugins.push(new WebpackVisualizer({
            filename: `${config.output.filename}.stats.html`
        }));
    } else {
        plugins.push(new ClosureCompilerPlugin({
            compiler: {
                language_in: 'ECMASCRIPT6',
                language_out: 'ECMASCRIPT5',
                compilation_level: 'SIMPLE',
                // compilation_level: 'ADVANCED', // not yet
                rewrite_polyfills: false,
                use_types_for_optimization: false,
                // warning_level: 'QUIET',
                jscomp_off: '*',
                jscomp_warning: '*',
                source_map_format: 'V3',
                create_source_map: `${config.output.path}/${config.output.filename}.map`,
                output_wrapper: `%output%\n//# sourceMappingURL=${config.output.filename}.map`
            },
            concurrency: 3,
        }));
    }
    // plugins.push(new OptimizeJsPlugin({
    //     sourceMap: true
    // }));
    plugins.push(license());
    return plugins;
}

function license() {
    return new webpack.BannerPlugin({
        entryOnly: true,
        banner: `
Copyright 2017 Graphistry, Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
or implied. See the License for the specific language governing
permissions and limitations under the License.`
    });
}

/**
 * Configuration file for font-awesome-webpack
 *
 * In order to keep the bundle size low in production,
 * disable components you don't use.
 *
 */

module.exports = {
    styleLoader: require('extract-text-webpack-plugin').extract('style-loader', 'css-loader!postcss-loader!less-loader'),
    styles: {
        mixins: false,
        core: false,
        icons: true,
        larger: true,
        path: true,
        animated: false,
    }
};

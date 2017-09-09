'use strict'; // eslint-disable-line

const path = require('path');
const coverageDir = path.join(process.cwd(), './coverage');
const junitCoverageDir = path.join(coverageDir, './junit');
const webpackConfig = require('../webpack/webpack.config.karma');

module.exports = (config) => {
  config.set({
    browsers: ['PhantomJS'],

    singleRun: true,

    frameworks: ['mocha'],

    files: [
      '../../node_modules/babel-polyfill/dist/polyfill.js',
      './test-bundler.js'
    ],

    preprocessors: {
      './test-bundler.js': ['webpack', 'sourcemap'],
    },

    reporters: ['mocha', 'coverage'],

    webpack: webpackConfig,

    // Make Webpack bundle generation quiet
    webpackMiddleware: {
      quiet: true,
      noInfo: true,
      stats: 'errors-only',
    },

    junitReporter: {
      outputDir: junitCoverageDir
    },

    // Set the format of reporter
    coverageReporter: {
      dir: coverageDir,
      reporters: [
        { type: 'html', subdir: 'html' },
        { type: 'lcov', subdir: 'lcov' },
        { type: 'text-summary', subdir: '.', file: 'text-summary.txt' },
      ],
    },
  });
};

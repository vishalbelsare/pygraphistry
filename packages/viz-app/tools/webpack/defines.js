const child_process = require('child_process');
const vizAppPackage = require('../../package.json');
const graphistryConfig = require('@graphistry/config')();

const buildDate = Date.now();
const buildNumber = process.env.BUILD_NUMBER || 'dev';
const commitId = child_process.execSync('git rev-parse --short HEAD').toString().trim();
const revName = child_process.execSync('git name-rev --name-only HEAD').toString().trim();

const versions = {
    __BUILDDATE__: `${buildDate}`,
    __GITBRANCH__: `"${revName}"`,
    __GITCOMMIT__: `"${commitId}"`,
    __VERSION__: JSON.stringify(vizAppPackage.version),
    __RELEASE__: JSON.stringify(graphistryConfig.RELEASE),
    __BUILDNUMBER__: buildNumber ? `"${buildNumber}"` : undefined,
};

// Disable CSSModules here
const CSSModules = true;

// Register vendors here
const vendor = [

    'ace',
    'brace',
    'chalk',
    'debug',
    // 'jquery', // TODO: kill jQuery
    'lodash',
    'recompose',
    'underscore',

    'd3-color',
    'd3-scale',
    'd3-time-format',

    'react',
    'redux',
    'react-ace',
    'react-dom',
    'react-redux',
    'react-helmet',
    'redbox-react',
    'react-overlays',
    'react-bootstrap',
    'react-hot-loader',
    'redux-observable',

    'simpleflakes',
    'socket.io-client',

    'moment',
    'moment-timezone',

    'rxjs',
    'rxjs-gestures',

    'pegjs',
    'pegjs-util',

    'rc-switch',
    'rc-color-picker',
    '@graphistry/rc-slider',

    '@graphistry/falcor',
    '@graphistry/falcor-router',
    '@graphistry/falcor-json-graph',
    '@graphistry/falcor-path-syntax',
    '@graphistry/falcor-path-utils',
    '@graphistry/falcor-react-redux',
    '@graphistry/falcor-query-syntax',
    '@graphistry/falcor-react-schema',
    '@graphistry/falcor-router-saddle',
    '@graphistry/falcor-socket-datasource'
];

module.exports = { CSSModules, vendor, versions };

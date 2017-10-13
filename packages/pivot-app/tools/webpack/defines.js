const child_process = require('child_process');

const buildDate = Date.now();
const buildNumber = process.env.BUILD_NUMBER || 'dev';
const commitId =
    process.env.COMMIT_ID ||
    child_process
        .execSync('git rev-parse --short HEAD')
        .toString()
        .trim();
const revName =
    process.env.BRANCH_NAME ||
    process.env.REV_NAME ||
    child_process
        .execSync('git name-rev --name-only HEAD')
        .toString()
        .trim();

const versions = {
    __RELEASE__: undefined,
    __BUILDDATE__: `${buildDate}`,
    __GITBRANCH__: `"${revName}"`,
    __GITCOMMIT__: `"${commitId}"`,
    __BUILDNUMBER__: buildNumber ? `"${buildNumber}"` : undefined
};

// Disable CSSModules here
const CSSModules = true;

// Register vendors here
const vendor = [
    'ncp',
    'util',
    'rxjs',
    'debug',
    'brace',
    'react',
    'bn.js',
    'pegjs',
    'json3',
    'redux',
    'buffer',
    'verror',
    'bunyan',
    'lodash',
    'moment',
    'rimraf',
    'assert',
    'bowser',
    'core-js',
    'history',
    'd3-scale',
    'dnd-core',
    'd3-color',
    'react-dnd',
    'rc-switch',
    'react-dom',
    'recompose',
    'minimatch',
    'react-ace',
    'source-map',
    'underscore',
    'pegjs-util',
    'disposables',
    'es-abstract',
    'dom-helpers',
    'react-dates',
    'react-redux',
    'react-helmet',
    'redbox-react',
    'simpleflakes',
    'react-portal',
    'react-select',
    'rxjs-gestures',
    'lodash.omitby',
    'uncontrollable',
    'react-overlays',
    'd3-time-format',
    'react-bootstrap',
    'brace-expansion',
    'rc-color-picker',
    'querystring-es3',
    'moment-timezone',
    'react-tag-input',
    'socket.io-client',
    'react-hot-loader',
    'react-split-pane',
    'redux-observable',
    '@graphistry/falcor',
    'better-react-spinkit',
    'react-input-autosize',
    'react-style-proptype',
    'inline-style-prefixer',
    '@graphistry/rc-slider',
    'react-bootstrap-table',
    '@graphistry/client-api',
    '@allenfang/react-toastr',
    'react-dnd-html5-backend',
    '@graphistry/react-select',
    '@graphistry/falcor-router',
    '@graphistry/client-api-react',
    '@graphistry/falcor-json-graph',
    '@graphistry/falcor-path-utils',
    '@graphistry/falcor-model-rxjs',
    '@graphistry/falcor-react-redux',
    '@graphistry/falcor-path-syntax',
    '@graphistry/falcor-react-schema',
    '@graphistry/falcor-query-syntax',
    '@graphistry/falcor-router-saddle',
    '@graphistry/falcor-socket-datasource'
];

module.exports = { CSSModules, vendor, versions };

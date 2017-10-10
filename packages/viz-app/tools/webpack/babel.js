const path = require('path');
const HappyPack = require('happypack');

module.exports = addBabelRules;

function addBabelRules({ isDev, type, vendor, environment, threadPool }, appConfig) {
  appConfig.plugins.push(happyBabelPlugin(isDev, type, vendor, environment, threadPool));
  appConfig.module.rules.push({
    test: /\.js$/,
    exclude: /node_modules/,
    loader: 'happypack/loader?id=js'
  });
  return appConfig;
}

function happyBabelPlugin(isDev, type, vendor, environment, threadPool) {
  const presets = [['es2015', { modules: false, loose: true }], 'react', 'stage-0'];

  const imports = {
    lodash: {
      preventFullImport: true,
      transform: 'lodash/${member}'
    },
    'react-bootstrap': {
      preventFullImport: true,
      transform: 'react-bootstrap/lib/${member}'
    },
    'react-virtualized': {
      preventFullImport: true,
      transform: 'react-virtualized/dist/commonjs/${member}/${member}'
    }
  };

  const plugins = ['transform-runtime', ['transform-imports', imports]];

  if (isDev) {
    plugins.push('react-hot-loader/babel');
  } else {
    plugins.push(
      // Don't use this plugin: it breaks FF31, used by InQTel
      // 'transform-react-inline-elements'
      'transform-react-constant-elements',
      [
        'transform-react-remove-prop-types',
        {
          mode: 'remove',
          removeImport: true,
          additionalLibraries: [
            'prop-types',
            'react-ace',
            'react-dock',
            'react-select',
            'redbox-react',
            'react-overlays',
            'react-bootstrap',
            'react-split-pane',
            'react-virtualized',
            'react-immutable-proptypes'
          ]
        }
      ]
    );
  }

  return new HappyPack({
    id: 'js',
    verbose: false,
    threadPool: threadPool,
    loaders: [
      {
        loader: 'cache-loader',
        options: {
          cacheDirectory: path.resolve(
            process.cwd(),
            `./node_modules/.cache/cache-loader/${environment}`
          )
        }
      },
      {
        loader: 'babel-loader',
        options: {
          babelrc: false,
          presets: presets,
          plugins: plugins
        }
      }
    ]
  });
}

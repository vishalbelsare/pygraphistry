// The node-convict configuration schema for viz-app

const config = require('@graphistry/config')();

module.exports = {
  env: {
    doc: 'The applicaton environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  host: {
    doc: 'Viz-app host name/IP',
    format: 'ipaddress',
    default: config.VIZ_LISTEN_ADDRESS,
    env: 'HOST'
  },
  port: {
    doc: 'Viz-app port number',
    format: 'port',
    default: config.VIZ_LISTEN_PORT,
    arg: 'port',
    env: 'PORT'
  },
  s3: {
    access: {
      doc: 'The S3 access token',
      format: String,
      default: config.S3_ACCESS,
      arg: 's3-access',
      env: 'S3_ACCESS'
    },
    secret: {
      doc: 'The S3 access secret',
      format: String,
      default: config.S3_SECRET,
      arg: 's3-secret',
      env: 'S3_SECRET'
    }
  },
  device: {
    type: {
      doc: 'The device to use',
      format: ['cpu', 'gpu', 'any'],
      default: 'any',
      arg: 'device-type',
      env: 'DEVICE_TYPE'
    },
    warp_size: {
      doc:
        'The number of threads per core. For GPUs, this is the number of compute units divided by the number of stream processors.',
      format: Number,
      default:
        (config.GPU_OPTIONS && config.GPU_OPTIONS.WARPSIZE) || 1 /* 1 is always at least correct */,
      arg: 'warp-size',
      env: 'WARP_SIZE'
    }
  },
  log: {
    level: {
      doc: `Log levels - ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']`,
      format: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
      default: 'INFO',
      arg: 'log-level',
      env: 'GRAPHISTRY_LOG_LEVEL' // LOG_LEVEL conflicts with mocha
    },
    file: {
      doc: 'Log to a file intead of stdout',
      format: String,
      default: undefined,
      arg: 'log-file',
      env: 'LOG_FILE'
    },
    logSource: {
      doc: 'Logs line numbers with debug statements. Bad for Perf.',
      format: Boolean,
      default: false,
      arg: 'log-source',
      env: 'LOG_SOURCE'
    },
    heartbeat: {
      central: {
        doc:
          'Heartbeat interval in milliseconds for central server; 0 means disabled. (Setting currently ignored.)',
        format: Number,
        default: 0,
        arg: 'heartbeat-central',
        env: 'HEARTBEAT_CENTRAL'
      },
      worker: {
        doc: 'Heartbeat interval in milliseconds for each worker; 0 means disabled',
        format: Number,
        default: 30000,
        arg: 'heartbeat-worker',
        env: 'HEARTBEAT_WORKER'
      }
    }
  },
  authentication: {
    username: {
      doc: 'The username used to access this service',
      format: String,
      default: 'admin',
      arg: 'username',
      env: 'USERNAME'
    },
    passwordHash: {
      doc:
        'Bcrypt hash of the password required to access this service, or unset/empty to disable authentication (default)',
      format: String,
      default: '',
      arg: 'password-hash',
      env: 'PASSWORD_HASH'
    }
  }
};

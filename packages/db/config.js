const convict = require('convict');
const Path = require('path');

// Define a schema
var config = convict({
  env: {
    doc: 'The node environment',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  db: {
    host: {
      doc: 'The host for your database.',
      format: String,
      default: 'localhost',
      env: 'DBHOST'
    },
    port: {
      doc: 'The port for your database',
      format: Number,
      default: 5432,
      env: 'DBPORT'
    },
    username: {
      doc: 'Your database username',
      format: String,
      default: 'graphistry',
      env: 'DBUSER'
    },
    password: {
      doc: 'Your database password',
      format: String,
      default: 'graphtheplanet!',
      env: 'DBPASSWORD'
    },
    dbname: {
      doc: 'Your database name',
      format: String,
      default: 'graphistry',
      env: 'DBNAME'
    }
  }
});

var env = config.get('env');
console.log(`Now initializing the <<${env}>> configuration for database access.`);
config.loadFile(Path.join(__dirname, 'config', `${env}.json`));

// Perform validation
config.validate({ allowed: 'strict' });

module.exports = config;
